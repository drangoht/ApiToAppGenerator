export function minifyOpenApiSpec(spec: any): any {
  const minified = JSON.parse(JSON.stringify(spec));

  delete minified.tags;
  delete minified.externalDocs;

  if (minified.paths) {
    for (const pathKey of Object.keys(minified.paths)) {
      for (const method of Object.keys(minified.paths[pathKey])) {
        if (!["get", "post", "put", "delete", "patch"].includes(method.toLowerCase())) {
          delete minified.paths[pathKey][method];
          continue;
        }
        const endpoint = minified.paths[pathKey][method];
        delete endpoint.tags;
        delete endpoint.summary; // Extracted separately
        delete endpoint.description; // Extracted separately
        delete endpoint.operationId;
        delete endpoint.externalDocs;

        if (endpoint.parameters) {
          for (const param of endpoint.parameters) {
            delete param.description;
            delete param.example;
            delete param.examples;
          }
        }

        if (endpoint.responses) {
          for (const resKey of Object.keys(endpoint.responses)) {
            const res = endpoint.responses[resKey];
            delete res.description;
            if (res.content) {
              for (const mediaType of Object.keys(res.content)) {
                delete res.content[mediaType].example;
                delete res.content[mediaType].examples;
              }
            }
          }
        }

        if (endpoint.requestBody && endpoint.requestBody.content) {
          delete endpoint.requestBody.description;
          for (const mediaType of Object.keys(endpoint.requestBody.content)) {
            delete endpoint.requestBody.content[mediaType].example;
            delete endpoint.requestBody.content[mediaType].examples;
          }
        }
      }
    }
  }

  if (minified.components && minified.components.schemas) {
    const cleanSchema = (schema: any) => {
      if (!schema || typeof schema !== "object") return;
      delete schema.description;
      delete schema.example;
      delete schema.examples;
      delete schema.default;

      if (schema.properties) {
        for (const prop of Object.keys(schema.properties)) {
          cleanSchema(schema.properties[prop]);
        }
      }
      if (schema.items) cleanSchema(schema.items);
      if (schema.allOf) schema.allOf.forEach(cleanSchema);
      if (schema.anyOf) schema.anyOf.forEach(cleanSchema);
      if (schema.oneOf) schema.oneOf.forEach(cleanSchema);
    };

    for (const schemaKey of Object.keys(minified.components.schemas)) {
      cleanSchema(minified.components.schemas[schemaKey]);
    }
  }

  return minified;
}

