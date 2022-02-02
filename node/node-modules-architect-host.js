"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceNodeModulesArchitectHost = void 0;
const path = __importStar(require("path"));
const url_1 = require("url");
const v8_1 = require("v8");
const internal_1 = require("../src/internal");
function clone(obj) {
    try {
        return (0, v8_1.deserialize)((0, v8_1.serialize)(obj));
    }
    catch (_a) {
        return JSON.parse(JSON.stringify(obj));
    }
}
function findProjectTarget(workspace, project, target) {
    const projectDefinition = workspace.projects.get(project);
    if (!projectDefinition) {
        throw new Error(`Project "${project}" does not exist.`);
    }
    const targetDefinition = projectDefinition.targets.get(target);
    if (!targetDefinition) {
        throw new Error('Project target does not exist.');
    }
    return targetDefinition;
}
class WorkspaceNodeModulesArchitectHost {
    constructor(workspaceOrHost, _root) {
        this._root = _root;
        if ('getBuilderName' in workspaceOrHost) {
            this.workspaceHost = workspaceOrHost;
        }
        else {
            this.workspaceHost = {
                async getBuilderName(project, target) {
                    const targetDefinition = findProjectTarget(workspaceOrHost, project, target);
                    return targetDefinition.builder;
                },
                async getOptions(project, target, configuration) {
                    var _a, _b, _c, _d;
                    const targetDefinition = findProjectTarget(workspaceOrHost, project, target);
                    if (configuration === undefined) {
                        return ((_a = targetDefinition.options) !== null && _a !== void 0 ? _a : {});
                    }
                    if (!((_b = targetDefinition.configurations) === null || _b === void 0 ? void 0 : _b[configuration])) {
                        throw new Error(`Configuration '${configuration}' is not set in the workspace.`);
                    }
                    return ((_d = (_c = targetDefinition.configurations) === null || _c === void 0 ? void 0 : _c[configuration]) !== null && _d !== void 0 ? _d : {});
                },
                async getMetadata(project) {
                    const projectDefinition = workspaceOrHost.projects.get(project);
                    if (!projectDefinition) {
                        throw new Error(`Project "${project}" does not exist.`);
                    }
                    return {
                        root: projectDefinition.root,
                        sourceRoot: projectDefinition.sourceRoot,
                        prefix: projectDefinition.prefix,
                        ...clone(workspaceOrHost.extensions),
                        ...clone(projectDefinition.extensions),
                    };
                },
                async hasTarget(project, target) {
                    var _a;
                    return !!((_a = workspaceOrHost.projects.get(project)) === null || _a === void 0 ? void 0 : _a.targets.has(target));
                },
                async getDefaultConfigurationName(project, target) {
                    var _a, _b;
                    return (_b = (_a = workspaceOrHost.projects.get(project)) === null || _a === void 0 ? void 0 : _a.targets.get(target)) === null || _b === void 0 ? void 0 : _b.defaultConfiguration;
                },
            };
        }
    }
    async getBuilderNameForTarget(target) {
        return this.workspaceHost.getBuilderName(target.project, target.target);
    }
    /**
     * Resolve a builder. This needs to be a string which will be used in a dynamic `import()`
     * clause. This should throw if no builder can be found. The dynamic import will throw if
     * it is unsupported.
     * @param builderStr The name of the builder to be used.
     * @returns All the info needed for the builder itself.
     */
    resolveBuilder(builderStr) {
        const [packageName, builderName] = builderStr.split(':', 2);
        if (!builderName) {
            throw new Error('No builder name specified.');
        }
        const packageJsonPath = require.resolve(packageName + '/package.json', {
            paths: [this._root],
        });
        const packageJson = require(packageJsonPath);
        if (!packageJson['builders']) {
            throw new Error(`Package ${JSON.stringify(packageName)} has no builders defined.`);
        }
        const builderJsonPath = path.resolve(path.dirname(packageJsonPath), packageJson['builders']);
        const builderJson = require(builderJsonPath);
        const builder = builderJson.builders && builderJson.builders[builderName];
        if (!builder) {
            throw new Error(`Cannot find builder ${JSON.stringify(builderStr)}.`);
        }
        const importPath = builder.implementation;
        if (!importPath) {
            throw new Error('Could not find the implementation for builder ' + builderStr);
        }
        return Promise.resolve({
            name: builderStr,
            builderName,
            description: builder['description'],
            optionSchema: require(path.resolve(path.dirname(builderJsonPath), builder.schema)),
            import: path.resolve(path.dirname(builderJsonPath), importPath),
        });
    }
    async getCurrentDirectory() {
        return process.cwd();
    }
    async getWorkspaceRoot() {
        return this._root;
    }
    async getOptionsForTarget(target) {
        if (!(await this.workspaceHost.hasTarget(target.project, target.target))) {
            return null;
        }
        let options = await this.workspaceHost.getOptions(target.project, target.target);
        const targetConfiguration = target.configuration ||
            (await this.workspaceHost.getDefaultConfigurationName(target.project, target.target));
        if (targetConfiguration) {
            const configurations = targetConfiguration.split(',').map((c) => c.trim());
            for (const configuration of configurations) {
                options = {
                    ...options,
                    ...(await this.workspaceHost.getOptions(target.project, target.target, configuration)),
                };
            }
        }
        return clone(options);
    }
    async getProjectMetadata(target) {
        const projectName = typeof target === 'string' ? target : target.project;
        const metadata = this.workspaceHost.getMetadata(projectName);
        return metadata;
    }
    async loadBuilder(info) {
        const builder = await getBuilder(info.import);
        if (builder[internal_1.BuilderSymbol]) {
            return builder;
        }
        // Default handling code is for old builders that incorrectly export `default` with non-ESM module
        if (builder === null || builder === void 0 ? void 0 : builder.default[internal_1.BuilderSymbol]) {
            return builder.default;
        }
        throw new Error('Builder is not a builder');
    }
}
exports.WorkspaceNodeModulesArchitectHost = WorkspaceNodeModulesArchitectHost;
/**
 * This uses a dynamic import to load a module which may be ESM.
 * CommonJS code can load ESM code via a dynamic import. Unfortunately, TypeScript
 * will currently, unconditionally downlevel dynamic import into a require call.
 * require calls cannot load ESM code and will result in a runtime error. To workaround
 * this, a Function constructor is used to prevent TypeScript from changing the dynamic import.
 * Once TypeScript provides support for keeping the dynamic import this workaround can
 * be dropped.
 *
 * @param modulePath The path of the module to load.
 * @returns A Promise that resolves to the dynamically imported module.
 */
function loadEsmModule(modulePath) {
    return new Function('modulePath', `return import(modulePath);`)(modulePath);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getBuilder(builderPath) {
    switch (path.extname(builderPath)) {
        case '.mjs':
            // Load the ESM configuration file using the TypeScript dynamic import workaround.
            // Once TypeScript provides support for keeping the dynamic import this workaround can be
            // changed to a direct dynamic import.
            return (await loadEsmModule((0, url_1.pathToFileURL)(builderPath))).default;
        case '.cjs':
            return require(builderPath);
        default:
            // The file could be either CommonJS or ESM.
            // CommonJS is tried first then ESM if loading fails.
            try {
                return require(builderPath);
            }
            catch (e) {
                if (e.code === 'ERR_REQUIRE_ESM') {
                    // Load the ESM configuration file using the TypeScript dynamic import workaround.
                    // Once TypeScript provides support for keeping the dynamic import this workaround can be
                    // changed to a direct dynamic import.
                    return (await loadEsmModule((0, url_1.pathToFileURL)(builderPath))).default;
                }
                throw e;
            }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS1tb2R1bGVzLWFyY2hpdGVjdC1ob3N0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYXJjaGl0ZWN0L25vZGUvbm9kZS1tb2R1bGVzLWFyY2hpdGVjdC1ob3N0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFHSCwyQ0FBNkI7QUFDN0IsNkJBQXlDO0FBQ3pDLDJCQUE0QztBQUk1Qyw4Q0FBd0U7QUFNeEUsU0FBUyxLQUFLLENBQUMsR0FBWTtJQUN6QixJQUFJO1FBQ0YsT0FBTyxJQUFBLGdCQUFXLEVBQUMsSUFBQSxjQUFTLEVBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztLQUNwQztJQUFDLFdBQU07UUFDTixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0tBQ3hDO0FBQ0gsQ0FBQztBQVVELFNBQVMsaUJBQWlCLENBQ3hCLFNBQXlDLEVBQ3pDLE9BQWUsRUFDZixNQUFjO0lBRWQsTUFBTSxpQkFBaUIsR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMxRCxJQUFJLENBQUMsaUJBQWlCLEVBQUU7UUFDdEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxZQUFZLE9BQU8sbUJBQW1CLENBQUMsQ0FBQztLQUN6RDtJQUVELE1BQU0sZ0JBQWdCLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMvRCxJQUFJLENBQUMsZ0JBQWdCLEVBQUU7UUFDckIsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO0tBQ25EO0lBRUQsT0FBTyxnQkFBZ0IsQ0FBQztBQUMxQixDQUFDO0FBRUQsTUFBYSxpQ0FBaUM7SUFPNUMsWUFDRSxlQUEr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QUFDLENBQUMsVUFBVSxDQUFlLENBQUM7QUFDNUYsQ0FBQztBQUVELDhEQUE4RDtBQUM5RCxLQUFLLFVBQVUsVUFBVSxDQUFDLFdBQW1CO0lBQzNDLFFBQVEsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsRUFBRTtRQUNqQyxLQUFLLE1BQU07WUFDVCxrRkFBa0Y7WUFDbEYseUZBQXlGO1lBQ3pGLHNDQUFzQztZQUN0QyxPQUFPLENBQUMsTUFBTSxhQUFhLENBQXVCLElBQUEsbUJBQWEsRUFBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1FBQ3pGLEtBQUssTUFBTTtZQUNULE9BQU8sT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzlCO1lBQ0UsNENBQTRDO1lBQzVDLHFEQUFxRDtZQUNyRCxJQUFJO2dCQUNGLE9BQU8sT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDO2FBQzdCO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1YsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLGlCQUFpQixFQUFFO29CQUNoQyxrRkFBa0Y7b0JBQ2xGLHlGQUF5RjtvQkFDekYsc0NBQXNDO29CQUN0QyxPQUFPLENBQUMsTUFBTSxhQUFhLENBQXVCLElBQUEsbUJBQWEsRUFBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO2lCQUN4RjtnQkFFRCxNQUFNLENBQUMsQ0FBQzthQUNUO0tBQ0o7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7IGpzb24sIHdvcmtzcGFjZXMgfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZSc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgVVJMLCBwYXRoVG9GaWxlVVJMIH0gZnJvbSAndXJsJztcbmltcG9ydCB7IGRlc2VyaWFsaXplLCBzZXJpYWxpemUgfSBmcm9tICd2OCc7XG5pbXBvcnQgeyBCdWlsZGVySW5mbyB9IGZyb20gJy4uL3NyYyc7XG5pbXBvcnQgeyBTY2hlbWEgYXMgQnVpbGRlclNjaGVtYSB9IGZyb20gJy4uL3NyYy9idWlsZGVycy1zY2hlbWEnO1xuaW1wb3J0IHsgVGFyZ2V0IH0gZnJvbSAnLi4vc3JjL2lucHV0LXNjaGVtYSc7XG5pbXBvcnQgeyBBcmNoaXRlY3RIb3N0LCBCdWlsZGVyLCBCdWlsZGVyU3ltYm9sIH0gZnJvbSAnLi4vc3JjL2ludGVybmFsJztcblxuZXhwb3J0IHR5cGUgTm9kZU1vZHVsZXNCdWlsZGVySW5mbyA9IEJ1aWxkZXJJbmZvICYge1xuICBpbXBvcnQ6IHN0cmluZztcbn07XG5cbmZ1bmN0aW9uIGNsb25lKG9iajogdW5rbm93bik6IHVua25vd24ge1xuICB0cnkge1xuICAgIHJldHVybiBkZXNlcmlhbGl6ZShzZXJpYWxpemUob2JqKSk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9iaikpO1xuICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ya3NwYWNlSG9zdCB7XG4gIGdldEJ1aWxkZXJOYW1lKHByb2plY3Q6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz47XG4gIGdldE1ldGFkYXRhKHByb2plY3Q6IHN0cmluZyk6IFByb21pc2U8anNvbi5Kc29uT2JqZWN0PjtcbiAgZ2V0T3B0aW9ucyhwcm9qZWN0OiBzdHJpbmcsIHRhcmdldDogc3RyaW5nLCBjb25maWd1cmF0aW9uPzogc3RyaW5nKTogUHJvbWlzZTxqc29uLkpzb25PYmplY3Q+O1xuICBoYXNUYXJnZXQocHJvamVjdDogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj47XG4gIGdldERlZmF1bHRDb25maWd1cmF0aW9uTmFtZShwcm9qZWN0OiBzdHJpbmcsIHRhcmdldDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xufVxuXG5mdW5jdGlvbiBmaW5kUHJvamVjdFRhcmdldChcbiAgd29ya3NwYWNlOiB3b3Jrc3BhY2VzLldvcmtzcGFjZURlZmluaXRpb24sXG4gIHByb2plY3Q6IHN0cmluZyxcbiAgdGFyZ2V0OiBzdHJpbmcsXG4pOiB3b3Jrc3BhY2VzLlRhcmdldERlZmluaXRpb24ge1xuICBjb25zdCBwcm9qZWN0RGVmaW5pdGlvbiA9IHdvcmtzcGFjZS5wcm9qZWN0cy5nZXQocHJvamVjdCk7XG4gIGlmICghcHJvamVjdERlZmluaXRpb24pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFByb2plY3QgXCIke3Byb2plY3R9XCIgZG9lcyBub3QgZXhpc3QuYCk7XG4gIH1cblxuICBjb25zdCB0YXJnZXREZWZpbml0aW9uID0gcHJvamVjdERlZmluaXRpb24udGFyZ2V0cy5nZXQodGFyZ2V0KTtcbiAgaWYgKCF0YXJnZXREZWZpbml0aW9uKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdQcm9qZWN0IHRhcmdldCBkb2VzIG5vdCBleGlzdC4nKTtcbiAgfVxuXG4gIHJldHVybiB0YXJnZXREZWZpbml0aW9uO1xufVxuXG5leHBvcnQgY2xhc3MgV29ya3NwYWNlTm9kZU1vZHVsZXNBcmNoaXRlY3RIb3N0IGltcGxlbWVudHMgQXJjaGl0ZWN0SG9zdDxOb2RlTW9kdWxlc0J1aWxkZXJJbmZvPiB7XG4gIHByaXZhdGUgd29ya3NwYWNlSG9zdDogV29ya3NwYWNlSG9zdDtcblxuICBjb25zdHJ1Y3Rvcih3b3Jrc3BhY2VIb3N0OiBXb3Jrc3BhY2VIb3N0LCBfcm9vdDogc3RyaW5nKTtcblxuICBjb25zdHJ1Y3Rvcih3b3Jrc3BhY2U6IHdvcmtzcGFjZXMuV29ya3NwYWNlRGVmaW5pdGlvbiwgX3Jvb3Q6IHN0cmluZyk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgd29ya3NwYWNlT3JIb3N0OiB3b3Jrc3BhY2VzLldvcmtzcGFjZURlZmluaXRpb24gfCBXb3Jrc3BhY2VIb3N0LFxuICAgIHByb3RlY3RlZCBfcm9vdDogc3RyaW5nLFxuICApIHtcbiAgICBpZiAoJ2dldEJ1aWxkZXJOYW1lJyBpbiB3b3Jrc3BhY2VPckhvc3QpIHtcbiAgICAgIHRoaXMud29ya3NwYWNlSG9zdCA9IHdvcmtzcGFjZU9ySG9zdDtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy53b3Jrc3BhY2VIb3N0ID0ge1xuICAgICAgICBhc3luYyBnZXRCdWlsZGVyTmFtZShwcm9qZWN0LCB0YXJnZXQpIHtcbiAgICAgICAgICBjb25zdCB0YXJnZXREZWZpbml0aW9uID0gZmluZFByb2plY3RUYXJnZXQod29ya3NwYWNlT3JIb3N0LCBwcm9qZWN0LCB0YXJnZXQpO1xuXG4gICAgICAgICAgcmV0dXJuIHRhcmdldERlZmluaXRpb24uYnVpbGRlcjtcbiAgICAgICAgfSxcbiAgICAgICAgYXN5bmMgZ2V0T3B0aW9ucyhwcm9qZWN0LCB0YXJnZXQsIGNvbmZpZ3VyYXRpb24pIHtcbiAgICAgICAgICBjb25zdCB0YXJnZXREZWZpbml0aW9uID0gZmluZFByb2plY3RUYXJnZXQod29ya3NwYWNlT3JIb3N0LCBwcm9qZWN0LCB0YXJnZXQpO1xuXG4gICAgICAgICAgaWYgKGNvbmZpZ3VyYXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuICh0YXJnZXREZWZpbml0aW9uLm9wdGlvbnMgPz8ge30pIGFzIGpzb24uSnNvbk9iamVjdDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoIXRhcmdldERlZmluaXRpb24uY29uZmlndXJhdGlvbnM/Lltjb25maWd1cmF0aW9uXSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb25maWd1cmF0aW9uICcke2NvbmZpZ3VyYXRpb259JyBpcyBub3Qgc2V0IGluIHRoZSB3b3Jrc3BhY2UuYCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuICh0YXJnZXREZWZpbml0aW9uLmNvbmZpZ3VyYXRpb25zPy5bY29uZmlndXJhdGlvbl0gPz8ge30pIGFzIGpzb24uSnNvbk9iamVjdDtcbiAgICAgICAgfSxcbiAgICAgICAgYXN5bmMgZ2V0TWV0YWRhdGEocHJvamVjdCkge1xuICAgICAgICAgIGNvbnN0IHByb2plY3REZWZpbml0aW9uID0gd29ya3NwYWNlT3JIb3N0LnByb2plY3RzLmdldChwcm9qZWN0KTtcbiAgICAgICAgICBpZiAoIXByb2plY3REZWZpbml0aW9uKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFByb2plY3QgXCIke3Byb2plY3R9XCIgZG9lcyBub3QgZXhpc3QuYCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJvb3Q6IHByb2plY3REZWZpbml0aW9uLnJvb3QsXG4gICAgICAgICAgICBzb3VyY2VSb290OiBwcm9qZWN0RGVmaW5pdGlvbi5zb3VyY2VSb290LFxuICAgICAgICAgICAgcHJlZml4OiBwcm9qZWN0RGVmaW5pdGlvbi5wcmVmaXgsXG4gICAgICAgICAgICAuLi4oY2xvbmUod29ya3NwYWNlT3JIb3N0LmV4dGVuc2lvbnMpIGFzIHt9KSxcbiAgICAgICAgICAgIC4uLihjbG9uZShwcm9qZWN0RGVmaW5pdGlvbi5leHRlbnNpb25zKSBhcyB7fSksXG4gICAgICAgICAgfSBhcyB1bmtub3duIGFzIGpzb24uSnNvbk9iamVjdDtcbiAgICAgICAgfSxcbiAgICAgICAgYXN5bmMgaGFzVGFyZ2V0KHByb2plY3QsIHRhcmdldCkge1xuICAgICAgICAgIHJldHVybiAhIXdvcmtzcGFjZU9ySG9zdC5wcm9qZWN0cy5nZXQocHJvamVjdCk/LnRhcmdldHMuaGFzKHRhcmdldCk7XG4gICAgICAgIH0sXG4gICAgICAgIGFzeW5jIGdldERlZmF1bHRDb25maWd1cmF0aW9uTmFtZShwcm9qZWN0LCB0YXJnZXQpIHtcbiAgICAgICAgICByZXR1cm4gd29ya3NwYWNlT3JIb3N0LnByb2plY3RzLmdldChwcm9qZWN0KT8udGFyZ2V0cy5nZXQodGFyZ2V0KT8uZGVmYXVsdENvbmZpZ3VyYXRpb247XG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGdldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0KHRhcmdldDogVGFyZ2V0KSB7XG4gICAgcmV0dXJuIHRoaXMud29ya3NwYWNlSG9zdC5nZXRCdWlsZGVyTmFtZSh0YXJnZXQucHJvamVjdCwgdGFyZ2V0LnRhcmdldCk7XG4gIH1cblxuICAvKipcbiAgICogUmVzb2x2ZSBhIGJ1aWxkZXIuIFRoaXMgbmVlZHMgdG8gYmUgYSBzdHJpbmcgd2hpY2ggd2lsbCBiZSB1c2VkIGluIGEgZHluYW1pYyBgaW1wb3J0KClgXG4gICAqIGNsYXVzZS4gVGhpcyBzaG91bGQgdGhyb3cgaWYgbm8gYnVpbGRlciBjYW4gYmUgZm91bmQuIFRoZSBkeW5hbWljIGltcG9ydCB3aWxsIHRocm93IGlmXG4gICAqIGl0IGlzIHVuc3VwcG9ydGVkLlxuICAgKiBAcGFyYW0gYnVpbGRlclN0ciBUaGUgbmFtZSBvZiB0aGUgYnVpbGRlciB0byBiZSB1c2VkLlxuICAgKiBAcmV0dXJucyBBbGwgdGhlIGluZm8gbmVlZGVkIGZvciB0aGUgYnVpbGRlciBpdHNlbGYuXG4gICAqL1xuICByZXNvbHZlQnVpbGRlcihidWlsZGVyU3RyOiBzdHJpbmcpOiBQcm9taXNlPE5vZGVNb2R1bGVzQnVpbGRlckluZm8+IHtcbiAgICBjb25zdCBbcGFja2FnZU5hbWUsIGJ1aWxkZXJOYW1lXSA9IGJ1aWxkZXJTdHIuc3BsaXQoJzonLCAyKTtcbiAgICBpZiAoIWJ1aWxkZXJOYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGJ1aWxkZXIgbmFtZSBzcGVjaWZpZWQuJyk7XG4gICAgfVxuXG4gICAgY29uc3QgcGFja2FnZUpzb25QYXRoID0gcmVxdWlyZS5yZXNvbHZlKHBhY2thZ2VOYW1lICsgJy9wYWNrYWdlLmpzb24nLCB7XG4gICAgICBwYXRoczogW3RoaXMuX3Jvb3RdLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcGFja2FnZUpzb24gPSByZXF1aXJlKHBhY2thZ2VKc29uUGF0aCk7XG4gICAgaWYgKCFwYWNrYWdlSnNvblsnYnVpbGRlcnMnXSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBQYWNrYWdlICR7SlNPTi5zdHJpbmdpZnkocGFja2FnZU5hbWUpfSBoYXMgbm8gYnVpbGRlcnMgZGVmaW5lZC5gKTtcbiAgICB9XG5cbiAgICBjb25zdCBidWlsZGVySnNvblBhdGggPSBwYXRoLnJlc29sdmUocGF0aC5kaXJuYW1lKHBhY2thZ2VKc29uUGF0aCksIHBhY2thZ2VKc29uWydidWlsZGVycyddKTtcbiAgICBjb25zdCBidWlsZGVySnNvbiA9IHJlcXVpcmUoYnVpbGRlckpzb25QYXRoKSBhcyBCdWlsZGVyU2NoZW1hO1xuXG4gICAgY29uc3QgYnVpbGRlciA9IGJ1aWxkZXJKc29uLmJ1aWxkZXJzICYmIGJ1aWxkZXJKc29uLmJ1aWxkZXJzW2J1aWxkZXJOYW1lXTtcblxuICAgIGlmICghYnVpbGRlcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZmluZCBidWlsZGVyICR7SlNPTi5zdHJpbmdpZnkoYnVpbGRlclN0cil9LmApO1xuICAgIH1cblxuICAgIGNvbnN0IGltcG9ydFBhdGggPSBidWlsZGVyLmltcGxlbWVudGF0aW9uO1xuICAgIGlmICghaW1wb3J0UGF0aCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgZmluZCB0aGUgaW1wbGVtZW50YXRpb24gZm9yIGJ1aWxkZXIgJyArIGJ1aWxkZXJTdHIpO1xuICAgIH1cblxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgbmFtZTogYnVpbGRlclN0cixcbiAgICAgIGJ1aWxkZXJOYW1lLFxuICAgICAgZGVzY3JpcHRpb246IGJ1aWxkZXJbJ2Rlc2NyaXB0aW9uJ10sXG4gICAgICBvcHRpb25TY2hlbWE6IHJlcXVpcmUocGF0aC5yZXNvbHZlKHBhdGguZGlybmFtZShidWlsZGVySnNvblBhdGgpLCBidWlsZGVyLnNjaGVtYSkpLFxuICAgICAgaW1wb3J0OiBwYXRoLnJlc29sdmUocGF0aC5kaXJuYW1lKGJ1aWxkZXJKc29uUGF0aCksIGltcG9ydFBhdGgpLFxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZ2V0Q3VycmVudERpcmVjdG9yeSgpIHtcbiAgICByZXR1cm4gcHJvY2Vzcy5jd2QoKTtcbiAgfVxuXG4gIGFzeW5jIGdldFdvcmtzcGFjZVJvb3QoKSB7XG4gICAgcmV0dXJuIHRoaXMuX3Jvb3Q7XG4gIH1cblxuICBhc3luYyBnZXRPcHRpb25zRm9yVGFyZ2V0KHRhcmdldDogVGFyZ2V0KTogUHJvbWlzZTxqc29uLkpzb25PYmplY3QgfCBudWxsPiB7XG4gICAgaWYgKCEoYXdhaXQgdGhpcy53b3Jrc3BhY2VIb3N0Lmhhc1RhcmdldCh0YXJnZXQucHJvamVjdCwgdGFyZ2V0LnRhcmdldCkpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBsZXQgb3B0aW9ucyA9IGF3YWl0IHRoaXMud29ya3NwYWNlSG9zdC5nZXRPcHRpb25zKHRhcmdldC5wcm9qZWN0LCB0YXJnZXQudGFyZ2V0KTtcbiAgICBjb25zdCB0YXJnZXRDb25maWd1cmF0aW9uID1cbiAgICAgIHRhcmdldC5jb25maWd1cmF0aW9uIHx8XG4gICAgICAoYXdhaXQgdGhpcy53b3Jrc3BhY2VIb3N0LmdldERlZmF1bHRDb25maWd1cmF0aW9uTmFtZSh0YXJnZXQucHJvamVjdCwgdGFyZ2V0LnRhcmdldCkpO1xuXG4gICAgaWYgKHRhcmdldENvbmZpZ3VyYXRpb24pIHtcbiAgICAgIGNvbnN0IGNvbmZpZ3VyYXRpb25zID0gdGFyZ2V0Q29uZmlndXJhdGlvbi5zcGxpdCgnLCcpLm1hcCgoYykgPT4gYy50cmltKCkpO1xuICAgICAgZm9yIChjb25zdCBjb25maWd1cmF0aW9uIG9mIGNvbmZpZ3VyYXRpb25zKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgICAuLi4oYXdhaXQgdGhpcy53b3Jrc3BhY2VIb3N0LmdldE9wdGlvbnModGFyZ2V0LnByb2plY3QsIHRhcmdldC50YXJnZXQsIGNvbmZpZ3VyYXRpb24pKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gY2xvbmUob3B0aW9ucykgYXMganNvbi5Kc29uT2JqZWN0O1xuICB9XG5cbiAgYXN5bmMgZ2V0UHJvamVjdE1ldGFkYXRhKHRhcmdldDogVGFyZ2V0IHwgc3RyaW5nKTogUHJvbWlzZTxqc29uLkpzb25PYmplY3QgfCBudWxsPiB7XG4gICAgY29uc3QgcHJvamVjdE5hbWUgPSB0eXBlb2YgdGFyZ2V0ID09PSAnc3RyaW5nJyA/IHRhcmdldCA6IHRhcmdldC5wcm9qZWN0O1xuICAgIGNvbnN0IG1ldGFkYXRhID0gdGhpcy53b3Jrc3BhY2VIb3N0LmdldE1ldGFkYXRhKHByb2plY3ROYW1lKTtcblxuICAgIHJldHVybiBtZXRhZGF0YTtcbiAgfVxuXG4gIGFzeW5jIGxvYWRCdWlsZGVyKGluZm86IE5vZGVNb2R1bGVzQnVpbGRlckluZm8pOiBQcm9taXNlPEJ1aWxkZXI+IHtcbiAgICBjb25zdCBidWlsZGVyID0gYXdhaXQgZ2V0QnVpbGRlcihpbmZvLmltcG9ydCk7XG5cbiAgICBpZiAoYnVpbGRlcltCdWlsZGVyU3ltYm9sXSkge1xuICAgICAgcmV0dXJuIGJ1aWxkZXI7XG4gICAgfVxuXG4gICAgLy8gRGVmYXVsdCBoYW5kbGluZyBjb2RlIGlzIGZvciBvbGQgYnVpbGRlcnMgdGhhdCBpbmNvcnJlY3RseSBleHBvcnQgYGRlZmF1bHRgIHdpdGggbm9uLUVTTSBtb2R1bGVcbiAgICBpZiAoYnVpbGRlcj8uZGVmYXVsdFtCdWlsZGVyU3ltYm9sXSkge1xuICAgICAgcmV0dXJuIGJ1aWxkZXIuZGVmYXVsdDtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0J1aWxkZXIgaXMgbm90IGEgYnVpbGRlcicpO1xuICB9XG59XG5cbi8qKlxuICogVGhpcyB1c2VzIGEgZHluYW1pYyBpbXBvcnQgdG8gbG9hZCBhIG1vZHVsZSB3aGljaCBtYXkgYmUgRVNNLlxuICogQ29tbW9uSlMgY29kZSBjYW4gbG9hZCBFU00gY29kZSB2aWEgYSBkeW5hbWljIGltcG9ydC4gVW5mb3J0dW5hdGVseSwgVHlwZVNjcmlwdFxuICogd2lsbCBjdXJyZW50bHksIHVuY29uZGl0aW9uYWxseSBkb3dubGV2ZWwgZHluYW1pYyBpbXBvcnQgaW50byBhIHJlcXVpcmUgY2FsbC5cbiAqIHJlcXVpcmUgY2FsbHMgY2Fubm90IGxvYWQgRVNNIGNvZGUgYW5kIHdpbGwgcmVzdWx0IGluIGEgcnVudGltZSBlcnJvci4gVG8gd29ya2Fyb3VuZFxuICogdGhpcywgYSBGdW5jdGlvbiBjb25zdHJ1Y3RvciBpcyB1c2VkIHRvIHByZXZlbnQgVHlwZVNjcmlwdCBmcm9tIGNoYW5naW5nIHRoZSBkeW5hbWljIGltcG9ydC5cbiAqIE9uY2UgVHlwZVNjcmlwdCBwcm92aWRlcyBzdXBwb3J0IGZvciBrZWVwaW5nIHRoZSBkeW5hbWljIGltcG9ydCB0aGlzIHdvcmthcm91bmQgY2FuXG4gKiBiZSBkcm9wcGVkLlxuICpcbiAqIEBwYXJhbSBtb2R1bGVQYXRoIFRoZSBwYXRoIG9mIHRoZSBtb2R1bGUgdG8gbG9hZC5cbiAqIEByZXR1cm5zIEEgUHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBkeW5hbWljYWxseSBpbXBvcnRlZCBtb2R1bGUuXG4gKi9cbmZ1bmN0aW9uIGxvYWRFc21Nb2R1bGU8VD4obW9kdWxlUGF0aDogc3RyaW5nIHwgVVJMKTogUHJvbWlzZTxUPiB7XG4gIHJldHVybiBuZXcgRnVuY3Rpb24oJ21vZHVsZVBhdGgnLCBgcmV0dXJuIGltcG9ydChtb2R1bGVQYXRoKTtgKShtb2R1bGVQYXRoKSBhcyBQcm9taXNlPFQ+O1xufVxuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuYXN5bmMgZnVuY3Rpb24gZ2V0QnVpbGRlcihidWlsZGVyUGF0aDogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHtcbiAgc3dpdGNoIChwYXRoLmV4dG5hbWUoYnVpbGRlclBhdGgpKSB7XG4gICAgY2FzZSAnLm1qcyc6XG4gICAgICAvLyBMb2FkIHRoZSBFU00gY29uZmlndXJhdGlvbiBmaWxlIHVzaW5nIHRoZSBUeXBlU2NyaXB0IGR5bmFtaWMgaW1wb3J0IHdvcmthcm91bmQuXG4gICAgICAvLyBPbmNlIFR5cGVTY3JpcHQgcHJvdmlkZXMgc3VwcG9ydCBmb3Iga2VlcGluZyB0aGUgZHluYW1pYyBpbXBvcnQgdGhpcyB3b3JrYXJvdW5kIGNhbiBiZVxuICAgICAgLy8gY2hhbmdlZCB0byBhIGRpcmVjdCBkeW5hbWljIGltcG9ydC5cbiAgICAgIHJldHVybiAoYXdhaXQgbG9hZEVzbU1vZHVsZTx7IGRlZmF1bHQ6IHVua25vd24gfT4ocGF0aFRvRmlsZVVSTChidWlsZGVyUGF0aCkpKS5kZWZhdWx0O1xuICAgIGNhc2UgJy5janMnOlxuICAgICAgcmV0dXJuIHJlcXVpcmUoYnVpbGRlclBhdGgpO1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBUaGUgZmlsZSBjb3VsZCBiZSBlaXRoZXIgQ29tbW9uSlMgb3IgRVNNLlxuICAgICAgLy8gQ29tbW9uSlMgaXMgdHJpZWQgZmlyc3QgdGhlbiBFU00gaWYgbG9hZGluZyBmYWlscy5cbiAgICAgIHRyeSB7XG4gICAgICAgIHJldHVybiByZXF1aXJlKGJ1aWxkZXJQYXRoKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKGUuY29kZSA9PT0gJ0VSUl9SRVFVSVJFX0VTTScpIHtcbiAgICAgICAgICAvLyBMb2FkIHRoZSBFU00gY29uZmlndXJhdGlvbiBmaWxlIHVzaW5nIHRoZSBUeXBlU2NyaXB0IGR5bmFtaWMgaW1wb3J0IHdvcmthcm91bmQuXG4gICAgICAgICAgLy8gT25jZSBUeXBlU2NyaXB0IHByb3ZpZGVzIHN1cHBvcnQgZm9yIGtlZXBpbmcgdGhlIGR5bmFtaWMgaW1wb3J0IHRoaXMgd29ya2Fyb3VuZCBjYW4gYmVcbiAgICAgICAgICAvLyBjaGFuZ2VkIHRvIGEgZGlyZWN0IGR5bmFtaWMgaW1wb3J0LlxuICAgICAgICAgIHJldHVybiAoYXdhaXQgbG9hZEVzbU1vZHVsZTx7IGRlZmF1bHQ6IHVua25vd24gfT4ocGF0aFRvRmlsZVVSTChidWlsZGVyUGF0aCkpKS5kZWZhdWx0O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgfVxufVxuIl19