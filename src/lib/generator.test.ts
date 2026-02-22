// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { GeneratorService } from './generator'

describe('GeneratorService', () => {
    it('minifies OpenAPI spec by efficiently removing descriptions and examples to save LLM tokens', () => {
        // We use a dummy ID and key since we're only testing the pure local parser function
        const service = new GeneratorService('test-id', 'test-key', 'gpt-4');

        const spec = {
            openapi: "3.0.0",
            info: { title: "Test API", description: "This should stay" },
            paths: {
                "/users": {
                    get: {
                        summary: "Get users",
                        description: "This should be deleted",
                        responses: {
                            "200": {
                                description: "Success response description",
                                content: {
                                    "application/json": {
                                        example: { id: 1 }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            components: {
                schemas: {
                    User: {
                        type: "object",
                        description: "User schema description",
                        properties: {
                            id: { type: "integer", example: 1 }
                        }
                    }
                }
            }
        };

        const minified = service['minifyOpenApiSpec'](spec);

        // Path level descriptions and summaries are extracted out of the spec body to save tokens
        expect(minified.paths['/users'].get.description).toBeUndefined();
        expect(minified.paths['/users'].get.summary).toBeUndefined();

        // Response descriptions and examples are stripped
        expect(minified.paths['/users'].get.responses['200'].description).toBeUndefined();
        expect(minified.paths['/users'].get.responses['200'].content['application/json'].example).toBeUndefined();

        // Schema descriptions and examples are stripped
        expect(minified.components.schemas.User.description).toBeUndefined();
        expect(minified.components.schemas.User.properties.id.example).toBeUndefined();

        // Essential routing data remains securely intact
        expect(minified.paths['/users'].get.responses['200']).toBeDefined();
        expect(minified.components.schemas.User.type).toBe("object");
    })
})
