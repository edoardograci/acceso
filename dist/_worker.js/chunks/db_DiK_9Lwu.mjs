globalThis.process ??= {}; globalThis.process.env ??= {};
import { createClient } from '@libsql/client';

const _originalFetch = globalThis.fetch ?? fetch;
const safeFetch = async (input, init) => {
  const url = typeof input === "string" ? input : String(input);
  try {
    if (url.includes("/v1/jobs")) {
      return new Response(JSON.stringify({}), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (err) {
  }
  return _originalFetch(input, init);
};
try {
  globalThis.fetch = safeFetch;
} catch (err) {
}
const turso = createClient({
  url: "libsql://acceso-edoardograci.aws-eu-west-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjIyMDI1MjMsImlkIjoiZmVlZDdhMDItM2Y5Ny00ZTkzLTkyMzMtN2JlNDAxNGJlZjE2IiwicmlkIjoiOTM5ZGNmYzktNzYxNi00MDk5LThkZDAtMDQzMDMyNjMxYTY4In0.p3lP2RC8WI42zIMhBpI3lOurJLN0NT4_R2DvUmofIO0bvqWuLlQ4kv6QAT4GPMYI5D5uXWNP2CO7MwFi4jVHBA",
  fetch: safeFetch
});
async function getAllStudios() {
  try {
    const result = await turso.execute({
      sql: "SELECT * FROM studios WHERE status = ? ORDER BY name ASC",
      args: ["Published"]
    });
    return result.rows;
  } catch (error) {
    console.error("Error fetching studios:", error);
    return [];
  }
}

export { getAllStudios as g };
