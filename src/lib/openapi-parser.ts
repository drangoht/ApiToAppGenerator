import SwaggerParser from "@apidevtools/swagger-parser";

export async function parseOpenApiSpec(content: string | object) {
    try {
        const api = await SwaggerParser.validate(content);
        return api;
    } catch (err) {
        console.error("Error parsing OpenAPI spec:", err);
        throw new Error("Invalid OpenAPI Specification");
    }
}
