globalThis.process ??= {}; globalThis.process.env ??= {};
import { createClient } from '@libsql/client';

const dbUrl = "libsql://acceso-edoardograci.aws-eu-west-1.turso.io";
const dbToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjIyMDI1MjMsImlkIjoiZmVlZDdhMDItM2Y5Ny00ZTkzLTkyMzMtN2JlNDAxNGJlZjE2IiwicmlkIjoiOTM5ZGNmYzktNzYxNi00MDk5LThkZDAtMDQzMDMyNjMxYTY4In0.p3lP2RC8WI42zIMhBpI3lOurJLN0NT4_R2DvUmofIO0bvqWuLlQ4kv6QAT4GPMYI5D5uXWNP2CO7MwFi4jVHBA";
const turso = createClient({
  url: dbUrl,
  authToken: dbToken
});
async function getAllStudios() {
  try {
    console.log("Fetching all studios...");
    const result = await turso.execute({
      sql: "SELECT * FROM studios WHERE status = ? ORDER BY name ASC",
      args: ["Published"]
    });
    console.log("Found studios:", result.rows.length);
    return result.rows;
  } catch (error) {
    console.error("Error fetching studios:", error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    throw error;
  }
}

export { getAllStudios as g };
