// Runs the REAL server (dist/index.js, over stdio) against a local stub of the public API that
// serves the recorded fixtures, and returns what an MCP client is shown. No network, no key.
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(here, "..", "fixtures");

export const ADDRESSES = {
  attr: "0x47666fab8bd0ac7003bce3f5c3585383f09486e2",
  mixer: "0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936",
  manual: "0x0d5550d52428e7e3175bfc9550207e4ad3859b17",
  court: "0x732afda0d3e88611a2b2c8ffb0428486619f35a5",
};

const load = (name, kind) => JSON.parse(readFileSync(path.join(FIXTURES, `${name}.${kind}.json`), "utf8"));

/** `extra` maps an address to a response object for the trace tool's REST read: { "<table>": rows }. */
export async function withServer(distIndex, fn, extra = {}) {
  const byAddress = Object.fromEntries(Object.entries(ADDRESSES).map(([k, a]) => [a, k]));
  const stub = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    res.setHeader("content-type", "application/json");
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.split("/").pop();
      res.end(JSON.stringify(extra[table] ?? []));
      return;
    }
    const name = byAddress[url.searchParams.get("address")];
    if (!name) { res.statusCode = 404; res.end(JSON.stringify({ error: "not in fixtures" })); return; }
    if (url.pathname.endsWith("/address-lookup")) res.end(JSON.stringify({ success: true, data: load(name, "lookup") }));
    else if (url.pathname.endsWith("/wallet-reputation")) res.end(JSON.stringify(load(name, "wallet")));
    else { res.statusCode = 404; res.end("{}"); }
  });
  await new Promise((r) => stub.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${stub.address().port}`;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [distIndex],
    env: {
      PATH: process.env.PATH ?? "",
      CHAINHINT_API_URL: `${base}/functions/v1`,
      CHAINHINT_SUPABASE_URL: base,
      CHAINHINT_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_stub",
    },
    stderr: "ignore",
  });
  const client = new Client({ name: "fixture-runner", version: "0" });
  await client.connect(transport);
  try {
    const call = async (tool, args) => {
      const r = await client.callTool({ name: tool, arguments: args });
      return r.content.map((c) => c.text).join("\n");
    };
    return await fn(call);
  } finally {
    await client.close();
    stub.close();
  }
}
