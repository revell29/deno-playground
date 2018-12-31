import {
  readDir,
  readlink,
  lstatSync,
  lstat,
  readDirSync,
  readlinkSync,
  FileInfo
} from "deno";

export interface Change {
  action: "ADDED" | "MODIFIED" | "DELETED";
  file: string;
}
export interface Options {
  interval?: number;
  followSymlink?: boolean;
  ignoreDotFiles?: boolean;
  log?: (s: string) => void;
  test?: RegExp | string;
  ignore?: RegExp | string;
}
export interface Watcher extends AsyncIterable<string[]> {
  start(callback: (changes: string[]) => void): () => void;
  end: () => void;
}
const defaultOptions = {
  interval: 1000,
  followSymlink: false,
  ignoreDotFiles: true,
  log: null,
  test: null,
  ignore: null
};

export default function watch(
  dirs: string | string[],
  options?: Options
): Watcher {
  dirs = Array.isArray(dirs) ? dirs : [dirs];
  options = Object.assign({}, defaultOptions, options);
  let abort = false;
  let timeout = null;
  const filter = makeFilter(options);
  async function* gen() {
    const state = {};
    let lastTime = Math.floor(Date.now() / 1000);
    for (let dir of dirs) {
      let files = {};
      collect(files, dir, options.followSymlink, filter);
      state[dir] = files;
    }
    while (true) {
      await new Promise(resolve => {
        timeout = setTimeout(resolve, options.interval);
      });
      if (abort) {
        break;
      }
      const lastTimeCopy = lastTime;
      lastTime = Math.floor(Date.now() / 1000);
      let allChanges = [];
      let start = Date.now();
      let count = 0;
      for (let dir in state) {
        const files = state[dir];
        count += Object.keys(files).length;
        const [newFiles, changes] = await detectChanges(
          files,
          lastTimeCopy,
          dir,
          options,
          filter
        );
        state[dir] = newFiles;
        allChanges = [...allChanges, ...changes];
      }
      let end = Date.now();
      options.log &&
        options.log(`took ${end - start}ms to traverse ${count} files`);
      if (allChanges.length) {
        yield allChanges;
      }
    }
  }
  return {
    [Symbol.asyncIterator]: gen,
    start: function(callback) {
      (async () => {
        for await (const changes of gen()) {
          callback(changes);
        }
      })();
      return this.end.bind(this);
    },
    end() {
      abort = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  };
}

function makeFilter({ test, ignore, ignoreDotFiles }: Options) {
  const testRegex = test
    ? typeof test === "string"
      ? new RegExp(test)
      : test
    : /.*/;
  const ignoreRegex = ignore
    ? typeof ignore === "string"
      ? new RegExp(ignore)
      : ignore
    : /$^/;
  return function filter(f: FileInfo) {
    if (ignoreDotFiles && f.name.charAt(0) === ".") {
      return false;
    }
    if (!testRegex.test(f.path)) {
      return false;
    }
    if (ignoreRegex.test(f.path)) {
      return false;
    }
    return true;
  };
}

async function detectChanges(
  prev: any,
  lastTime: number,
  dir: string,
  { followSymlink }: Options,
  filter: (info: FileInfo) => boolean
): Promise<[any, string[] | null]> {
  const curr = {};
  const changes = [];
  await walk(prev, curr, lastTime, dir, followSymlink, filter, changes);
  for (let path in prev) {
    changes.push({
      action: "DELETED",
      file: path
    });
  }
  return [curr, changes];
}

async function walk(
  prev: any,
  curr: any,
  lastTime: number,
  dir: string,
  followSymlink: boolean,
  filter: (info: FileInfo) => boolean,
  changes: Change[]
): Promise<void> {
  let files = [];
  let dirInfo = await lstat(dir);
  if (dirInfo.isDirectory()) {
    files = await readDir(dir);
  } else if (dirInfo.isSymlink()) {
    if (followSymlink) {
      const path = await readlink(dir);
      files = await readDir(path);
    }
  }
  const promises = [];
  for (let f of files) {
    if (!filter(f)) {
      continue;
    }
    if (f.isDirectory() || f.isSymlink()) {
      promises.push(
        walk(prev, curr, lastTime, f.path, followSymlink, filter, changes)
      );
      continue;
    }
    curr[f.path] = f.modified || f.created;
    // console.log(lastTime, curr[f.path]);
    if (!prev[f.path]) {
      changes.push({
        action: "ADDED",
        file: f.path
      });
    } else if (lastTime <= curr[f.path]) {
      changes.push({
        action: "MODIFIED",
        file: f.path
      });
    }
    delete prev[f.path];
  }
  await Promise.all(promises);
}

function collect(
  all: any,
  dir: string,
  followSymlink: boolean,
  filter: (f: FileInfo) => boolean
): void {
  let files = [];
  let dirInfo = lstatSync(dir);
  if (dirInfo.isDirectory()) {
    files = readDirSync(dir);
  } else if (dirInfo.isSymlink()) {
    if (followSymlink) {
      const path = readlinkSync(dir);
      files = readDirSync(path);
    }
  }
  for (let f of files) {
    if (!filter(f)) {
      continue;
    }
    if (f.isDirectory() || f.isSymlink()) {
      collect(all, f.path, followSymlink, filter);
      continue;
    }
    all[f.path] = f.modified || f.created;
  }
}
