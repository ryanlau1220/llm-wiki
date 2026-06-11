import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { appContract } from "@llm-wiki/types";

const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

export async function generateOpenApiSpec() {
  return openAPIGenerator.generate(appContract, {
    info: {
      title: "LLM Wiki API",
      version: "0.1.0",
      description: "API Reference for the LLM Wiki local-first AI system.",
    },
    servers: [
      {
        url: "http://localhost:3001/rpc",
        description: "Local development server",
      },
    ],
  });
}

export const scalarHtml = `
<!doctype html>
<html>
  <head>
    <title>LLM Wiki API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        margin: 0;
      }
    </style>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>
`;
