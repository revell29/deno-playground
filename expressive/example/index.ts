import * as expressive from "../mod.ts";

(async () => {
  const port = 3000;
  const app = new expressive.App();
  app.use(expressive.simpleLog());
  app.use(expressive.static_("./public"));
  app.use(expressive.bodyParser.json());
  app.get("/api/todos", async (req, res) => {
    await res.json(todos);
  });
  app.post("/api/todos", async (req, res) => {
    const todo = {
      id: id++,
      name: req.data.name
    };
    todos.push(todo);
    await res.json(todo);
  });
  app.get("/api/todos/{id}", async (req, res) => {
    if (todos[req.params.id]) {
      await res.json(todos[req.params.id]);
    } else {
      res.status = 404;
    }
  });
  app.delete("/api/todos/{id}", async (req, res) => {
    if (todos[+req.params.id]) {
      todos.splice(+req.params.id, 1);
    } else {
      res.status = 404;
    }
  });
  const server = await app.listen(port);
  console.log("app listening on port " + server.port);
})();

const todos = [];
let id = 0;
