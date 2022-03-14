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
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS1tb2R1bGVzLWFyY2hpdGVjdC1ob3N0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYXJjaGl0ZWN0L25vZGUvbm9kZS1tb2R1bGVzLWFyY2hpdGVjdC1ob3N0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBR0gsMkNBQTZCO0FBQzdCLDZCQUF5QztBQUN6QywyQkFBNEM7QUFJNUMsOENBQXdFO0FBTXhFLFNBQVMsS0FBSyxDQUFDLEdBQVk7SUFDekIsSUFBSTtRQUNGLE9BQU8sSUFBQSxnQkFBVyxFQUFDLElBQUEsY0FBUyxFQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7S0FDcEM7SUFBQyxXQUFNO1FBQ04sT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztLQUN4QztBQUNILENBQUM7QUFVRCxTQUFTLGlCQUFpQixDQUN4QixTQUF5QyxFQUN6QyxPQUFlLEVBQ2YsTUFBYztJQUVkLE1BQU0saUJBQWlCLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDMUQsSUFBSSxDQUFDLGlCQUFpQixFQUFFO1FBQ3RCLE1BQU0sSUFBSSxLQUFLLENBQUMsWUFBWSxPQUFPLG1CQUFtQixDQUFDLENBQUM7S0FDekQ7SUFFRCxNQUFNLGdCQUFnQixHQUFHLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDL0QsSUFBSSxDQUFDLGdCQUFnQixFQUFFO1FBQ3JCLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztLQUNuRDtJQUVELE9BQU8sZ0JBQWdCLENBQUM7QUFDMUIsQ0FBQztBQUVELE1BQWEsaUNBQWlDO0lBTzVDLFlBQ0Us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NEIsQ0FBQyxDQUFDLFVBQVUsQ0FBZSxDQUFDO0FBQzVGLENBQUM7QUFFRCw4REFBOEQ7QUFDOUQsS0FBSyxVQUFVLFVBQVUsQ0FBQyxXQUFtQjtJQUMzQyxRQUFRLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLEVBQUU7UUFDakMsS0FBSyxNQUFNO1lBQ1Qsa0ZBQWtGO1lBQ2xGLHlGQUF5RjtZQUN6RixzQ0FBc0M7WUFDdEMsT0FBTyxDQUFDLE1BQU0sYUFBYSxDQUF1QixJQUFBLG1CQUFhLEVBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUN6RixLQUFLLE1BQU07WUFDVCxPQUFPLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM5QjtZQUNFLDRDQUE0QztZQUM1QyxxREFBcUQ7WUFDckQsSUFBSTtnQkFDRixPQUFPLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQzthQUM3QjtZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNWLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxpQkFBaUIsRUFBRTtvQkFDaEMsa0ZBQWtGO29CQUNsRix5RkFBeUY7b0JBQ3pGLHNDQUFzQztvQkFDdEMsT0FBTyxDQUFDLE1BQU0sYUFBYSxDQUF1QixJQUFBLG1CQUFhLEVBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztpQkFDeEY7Z0JBRUQsTUFBTSxDQUFDLENBQUM7YUFDVDtLQUNKO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgeyBqc29uLCB3b3Jrc3BhY2VzIH0gZnJvbSAnQGFuZ3VsYXItZGV2a2l0L2NvcmUnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IFVSTCwgcGF0aFRvRmlsZVVSTCB9IGZyb20gJ3VybCc7XG5pbXBvcnQgeyBkZXNlcmlhbGl6ZSwgc2VyaWFsaXplIH0gZnJvbSAndjgnO1xuaW1wb3J0IHsgQnVpbGRlckluZm8gfSBmcm9tICcuLi9zcmMnO1xuaW1wb3J0IHsgU2NoZW1hIGFzIEJ1aWxkZXJTY2hlbWEgfSBmcm9tICcuLi9zcmMvYnVpbGRlcnMtc2NoZW1hJztcbmltcG9ydCB7IFRhcmdldCB9IGZyb20gJy4uL3NyYy9pbnB1dC1zY2hlbWEnO1xuaW1wb3J0IHsgQXJjaGl0ZWN0SG9zdCwgQnVpbGRlciwgQnVpbGRlclN5bWJvbCB9IGZyb20gJy4uL3NyYy9pbnRlcm5hbCc7XG5cbmV4cG9ydCB0eXBlIE5vZGVNb2R1bGVzQnVpbGRlckluZm8gPSBCdWlsZGVySW5mbyAmIHtcbiAgaW1wb3J0OiBzdHJpbmc7XG59O1xuXG5mdW5jdGlvbiBjbG9uZShvYmo6IHVua25vd24pOiB1bmtub3duIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZGVzZXJpYWxpemUoc2VyaWFsaXplKG9iaikpO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvYmopKTtcbiAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmtzcGFjZUhvc3Qge1xuICBnZXRCdWlsZGVyTmFtZShwcm9qZWN0OiBzdHJpbmcsIHRhcmdldDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+O1xuICBnZXRNZXRhZGF0YShwcm9qZWN0OiBzdHJpbmcpOiBQcm9taXNlPGpzb24uSnNvbk9iamVjdD47XG4gIGdldE9wdGlvbnMocHJvamVjdDogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZywgY29uZmlndXJhdGlvbj86IHN0cmluZyk6IFByb21pc2U8anNvbi5Kc29uT2JqZWN0PjtcbiAgaGFzVGFyZ2V0KHByb2plY3Q6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+O1xuICBnZXREZWZhdWx0Q29uZmlndXJhdGlvbk5hbWUocHJvamVjdDogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcbn1cblxuZnVuY3Rpb24gZmluZFByb2plY3RUYXJnZXQoXG4gIHdvcmtzcGFjZTogd29ya3NwYWNlcy5Xb3Jrc3BhY2VEZWZpbml0aW9uLFxuICBwcm9qZWN0OiBzdHJpbmcsXG4gIHRhcmdldDogc3RyaW5nLFxuKTogd29ya3NwYWNlcy5UYXJnZXREZWZpbml0aW9uIHtcbiAgY29uc3QgcHJvamVjdERlZmluaXRpb24gPSB3b3Jrc3BhY2UucHJvamVjdHMuZ2V0KHByb2plY3QpO1xuICBpZiAoIXByb2plY3REZWZpbml0aW9uKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBQcm9qZWN0IFwiJHtwcm9qZWN0fVwiIGRvZXMgbm90IGV4aXN0LmApO1xuICB9XG5cbiAgY29uc3QgdGFyZ2V0RGVmaW5pdGlvbiA9IHByb2plY3REZWZpbml0aW9uLnRhcmdldHMuZ2V0KHRhcmdldCk7XG4gIGlmICghdGFyZ2V0RGVmaW5pdGlvbikge1xuICAgIHRocm93IG5ldyBFcnJvcignUHJvamVjdCB0YXJnZXQgZG9lcyBub3QgZXhpc3QuJyk7XG4gIH1cblxuICByZXR1cm4gdGFyZ2V0RGVmaW5pdGlvbjtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZU5vZGVNb2R1bGVzQXJjaGl0ZWN0SG9zdCBpbXBsZW1lbnRzIEFyY2hpdGVjdEhvc3Q8Tm9kZU1vZHVsZXNCdWlsZGVySW5mbz4ge1xuICBwcml2YXRlIHdvcmtzcGFjZUhvc3Q6IFdvcmtzcGFjZUhvc3Q7XG5cbiAgY29uc3RydWN0b3Iod29ya3NwYWNlSG9zdDogV29ya3NwYWNlSG9zdCwgX3Jvb3Q6IHN0cmluZyk7XG5cbiAgY29uc3RydWN0b3Iod29ya3NwYWNlOiB3b3Jrc3BhY2VzLldvcmtzcGFjZURlZmluaXRpb24sIF9yb290OiBzdHJpbmcpO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHdvcmtzcGFjZU9ySG9zdDogd29ya3NwYWNlcy5Xb3Jrc3BhY2VEZWZpbml0aW9uIHwgV29ya3NwYWNlSG9zdCxcbiAgICBwcm90ZWN0ZWQgX3Jvb3Q6IHN0cmluZyxcbiAgKSB7XG4gICAgaWYgKCdnZXRCdWlsZGVyTmFtZScgaW4gd29ya3NwYWNlT3JIb3N0KSB7XG4gICAgICB0aGlzLndvcmtzcGFjZUhvc3QgPSB3b3Jrc3BhY2VPckhvc3Q7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMud29ya3NwYWNlSG9zdCA9IHtcbiAgICAgICAgYXN5bmMgZ2V0QnVpbGRlck5hbWUocHJvamVjdCwgdGFyZ2V0KSB7XG4gICAgICAgICAgY29uc3QgdGFyZ2V0RGVmaW5pdGlvbiA9IGZpbmRQcm9qZWN0VGFyZ2V0KHdvcmtzcGFjZU9ySG9zdCwgcHJvamVjdCwgdGFyZ2V0KTtcblxuICAgICAgICAgIHJldHVybiB0YXJnZXREZWZpbml0aW9uLmJ1aWxkZXI7XG4gICAgICAgIH0sXG4gICAgICAgIGFzeW5jIGdldE9wdGlvbnMocHJvamVjdCwgdGFyZ2V0LCBjb25maWd1cmF0aW9uKSB7XG4gICAgICAgICAgY29uc3QgdGFyZ2V0RGVmaW5pdGlvbiA9IGZpbmRQcm9qZWN0VGFyZ2V0KHdvcmtzcGFjZU9ySG9zdCwgcHJvamVjdCwgdGFyZ2V0KTtcblxuICAgICAgICAgIGlmIChjb25maWd1cmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiAodGFyZ2V0RGVmaW5pdGlvbi5vcHRpb25zID8/IHt9KSBhcyBqc29uLkpzb25PYmplY3Q7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCF0YXJnZXREZWZpbml0aW9uLmNvbmZpZ3VyYXRpb25zPy5bY29uZmlndXJhdGlvbl0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ29uZmlndXJhdGlvbiAnJHtjb25maWd1cmF0aW9ufScgaXMgbm90IHNldCBpbiB0aGUgd29ya3NwYWNlLmApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiAodGFyZ2V0RGVmaW5pdGlvbi5jb25maWd1cmF0aW9ucz8uW2NvbmZpZ3VyYXRpb25dID8/IHt9KSBhcyBqc29uLkpzb25PYmplY3Q7XG4gICAgICAgIH0sXG4gICAgICAgIGFzeW5jIGdldE1ldGFkYXRhKHByb2plY3QpIHtcbiAgICAgICAgICBjb25zdCBwcm9qZWN0RGVmaW5pdGlvbiA9IHdvcmtzcGFjZU9ySG9zdC5wcm9qZWN0cy5nZXQocHJvamVjdCk7XG4gICAgICAgICAgaWYgKCFwcm9qZWN0RGVmaW5pdGlvbikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQcm9qZWN0IFwiJHtwcm9qZWN0fVwiIGRvZXMgbm90IGV4aXN0LmApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByb290OiBwcm9qZWN0RGVmaW5pdGlvbi5yb290LFxuICAgICAgICAgICAgc291cmNlUm9vdDogcHJvamVjdERlZmluaXRpb24uc291cmNlUm9vdCxcbiAgICAgICAgICAgIHByZWZpeDogcHJvamVjdERlZmluaXRpb24ucHJlZml4LFxuICAgICAgICAgICAgLi4uKGNsb25lKHdvcmtzcGFjZU9ySG9zdC5leHRlbnNpb25zKSBhcyB7fSksXG4gICAgICAgICAgICAuLi4oY2xvbmUocHJvamVjdERlZmluaXRpb24uZXh0ZW5zaW9ucykgYXMge30pLFxuICAgICAgICAgIH0gYXMgdW5rbm93biBhcyBqc29uLkpzb25PYmplY3Q7XG4gICAgICAgIH0sXG4gICAgICAgIGFzeW5jIGhhc1RhcmdldChwcm9qZWN0LCB0YXJnZXQpIHtcbiAgICAgICAgICByZXR1cm4gISF3b3Jrc3BhY2VPckhvc3QucHJvamVjdHMuZ2V0KHByb2plY3QpPy50YXJnZXRzLmhhcyh0YXJnZXQpO1xuICAgICAgICB9LFxuICAgICAgICBhc3luYyBnZXREZWZhdWx0Q29uZmlndXJhdGlvbk5hbWUocHJvamVjdCwgdGFyZ2V0KSB7XG4gICAgICAgICAgcmV0dXJuIHdvcmtzcGFjZU9ySG9zdC5wcm9qZWN0cy5nZXQocHJvamVjdCk/LnRhcmdldHMuZ2V0KHRhcmdldCk/LmRlZmF1bHRDb25maWd1cmF0aW9uO1xuICAgICAgICB9LFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBnZXRCdWlsZGVyTmFtZUZvclRhcmdldCh0YXJnZXQ6IFRhcmdldCkge1xuICAgIHJldHVybiB0aGlzLndvcmtzcGFjZUhvc3QuZ2V0QnVpbGRlck5hbWUodGFyZ2V0LnByb2plY3QsIHRhcmdldC50YXJnZXQpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlc29sdmUgYSBidWlsZGVyLiBUaGlzIG5lZWRzIHRvIGJlIGEgc3RyaW5nIHdoaWNoIHdpbGwgYmUgdXNlZCBpbiBhIGR5bmFtaWMgYGltcG9ydCgpYFxuICAgKiBjbGF1c2UuIFRoaXMgc2hvdWxkIHRocm93IGlmIG5vIGJ1aWxkZXIgY2FuIGJlIGZvdW5kLiBUaGUgZHluYW1pYyBpbXBvcnQgd2lsbCB0aHJvdyBpZlxuICAgKiBpdCBpcyB1bnN1cHBvcnRlZC5cbiAgICogQHBhcmFtIGJ1aWxkZXJTdHIgVGhlIG5hbWUgb2YgdGhlIGJ1aWxkZXIgdG8gYmUgdXNlZC5cbiAgICogQHJldHVybnMgQWxsIHRoZSBpbmZvIG5lZWRlZCBmb3IgdGhlIGJ1aWxkZXIgaXRzZWxmLlxuICAgKi9cbiAgcmVzb2x2ZUJ1aWxkZXIoYnVpbGRlclN0cjogc3RyaW5nKTogUHJvbWlzZTxOb2RlTW9kdWxlc0J1aWxkZXJJbmZvPiB7XG4gICAgY29uc3QgW3BhY2thZ2VOYW1lLCBidWlsZGVyTmFtZV0gPSBidWlsZGVyU3RyLnNwbGl0KCc6JywgMik7XG4gICAgaWYgKCFidWlsZGVyTmFtZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBidWlsZGVyIG5hbWUgc3BlY2lmaWVkLicpO1xuICAgIH1cblxuICAgIGNvbnN0IHBhY2thZ2VKc29uUGF0aCA9IHJlcXVpcmUucmVzb2x2ZShwYWNrYWdlTmFtZSArICcvcGFja2FnZS5qc29uJywge1xuICAgICAgcGF0aHM6IFt0aGlzLl9yb290XSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHBhY2thZ2VKc29uID0gcmVxdWlyZShwYWNrYWdlSnNvblBhdGgpO1xuICAgIGlmICghcGFja2FnZUpzb25bJ2J1aWxkZXJzJ10pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgUGFja2FnZSAke0pTT04uc3RyaW5naWZ5KHBhY2thZ2VOYW1lKX0gaGFzIG5vIGJ1aWxkZXJzIGRlZmluZWQuYCk7XG4gICAgfVxuXG4gICAgY29uc3QgYnVpbGRlckpzb25QYXRoID0gcGF0aC5yZXNvbHZlKHBhdGguZGlybmFtZShwYWNrYWdlSnNvblBhdGgpLCBwYWNrYWdlSnNvblsnYnVpbGRlcnMnXSk7XG4gICAgY29uc3QgYnVpbGRlckpzb24gPSByZXF1aXJlKGJ1aWxkZXJKc29uUGF0aCkgYXMgQnVpbGRlclNjaGVtYTtcblxuICAgIGNvbnN0IGJ1aWxkZXIgPSBidWlsZGVySnNvbi5idWlsZGVycyAmJiBidWlsZGVySnNvbi5idWlsZGVyc1tidWlsZGVyTmFtZV07XG5cbiAgICBpZiAoIWJ1aWxkZXIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGZpbmQgYnVpbGRlciAke0pTT04uc3RyaW5naWZ5KGJ1aWxkZXJTdHIpfS5gKTtcbiAgICB9XG5cbiAgICBjb25zdCBpbXBvcnRQYXRoID0gYnVpbGRlci5pbXBsZW1lbnRhdGlvbjtcbiAgICBpZiAoIWltcG9ydFBhdGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGZpbmQgdGhlIGltcGxlbWVudGF0aW9uIGZvciBidWlsZGVyICcgKyBidWlsZGVyU3RyKTtcbiAgICB9XG5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgIG5hbWU6IGJ1aWxkZXJTdHIsXG4gICAgICBidWlsZGVyTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiBidWlsZGVyWydkZXNjcmlwdGlvbiddLFxuICAgICAgb3B0aW9uU2NoZW1hOiByZXF1aXJlKHBhdGgucmVzb2x2ZShwYXRoLmRpcm5hbWUoYnVpbGRlckpzb25QYXRoKSwgYnVpbGRlci5zY2hlbWEpKSxcbiAgICAgIGltcG9ydDogcGF0aC5yZXNvbHZlKHBhdGguZGlybmFtZShidWlsZGVySnNvblBhdGgpLCBpbXBvcnRQYXRoKSxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGdldEN1cnJlbnREaXJlY3RvcnkoKSB7XG4gICAgcmV0dXJuIHByb2Nlc3MuY3dkKCk7XG4gIH1cblxuICBhc3luYyBnZXRXb3Jrc3BhY2VSb290KCkge1xuICAgIHJldHVybiB0aGlzLl9yb290O1xuICB9XG5cbiAgYXN5bmMgZ2V0T3B0aW9uc0ZvclRhcmdldCh0YXJnZXQ6IFRhcmdldCk6IFByb21pc2U8anNvbi5Kc29uT2JqZWN0IHwgbnVsbD4ge1xuICAgIGlmICghKGF3YWl0IHRoaXMud29ya3NwYWNlSG9zdC5oYXNUYXJnZXQodGFyZ2V0LnByb2plY3QsIHRhcmdldC50YXJnZXQpKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgbGV0IG9wdGlvbnMgPSBhd2FpdCB0aGlzLndvcmtzcGFjZUhvc3QuZ2V0T3B0aW9ucyh0YXJnZXQucHJvamVjdCwgdGFyZ2V0LnRhcmdldCk7XG4gICAgY29uc3QgdGFyZ2V0Q29uZmlndXJhdGlvbiA9XG4gICAgICB0YXJnZXQuY29uZmlndXJhdGlvbiB8fFxuICAgICAgKGF3YWl0IHRoaXMud29ya3NwYWNlSG9zdC5nZXREZWZhdWx0Q29uZmlndXJhdGlvbk5hbWUodGFyZ2V0LnByb2plY3QsIHRhcmdldC50YXJnZXQpKTtcblxuICAgIGlmICh0YXJnZXRDb25maWd1cmF0aW9uKSB7XG4gICAgICBjb25zdCBjb25maWd1cmF0aW9ucyA9IHRhcmdldENvbmZpZ3VyYXRpb24uc3BsaXQoJywnKS5tYXAoKGMpID0+IGMudHJpbSgpKTtcbiAgICAgIGZvciAoY29uc3QgY29uZmlndXJhdGlvbiBvZiBjb25maWd1cmF0aW9ucykge1xuICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgIC4uLm9wdGlvbnMsXG4gICAgICAgICAgLi4uKGF3YWl0IHRoaXMud29ya3NwYWNlSG9zdC5nZXRPcHRpb25zKHRhcmdldC5wcm9qZWN0LCB0YXJnZXQudGFyZ2V0LCBjb25maWd1cmF0aW9uKSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGNsb25lKG9wdGlvbnMpIGFzIGpzb24uSnNvbk9iamVjdDtcbiAgfVxuXG4gIGFzeW5jIGdldFByb2plY3RNZXRhZGF0YSh0YXJnZXQ6IFRhcmdldCB8IHN0cmluZyk6IFByb21pc2U8anNvbi5Kc29uT2JqZWN0IHwgbnVsbD4ge1xuICAgIGNvbnN0IHByb2plY3ROYW1lID0gdHlwZW9mIHRhcmdldCA9PT0gJ3N0cmluZycgPyB0YXJnZXQgOiB0YXJnZXQucHJvamVjdDtcbiAgICBjb25zdCBtZXRhZGF0YSA9IHRoaXMud29ya3NwYWNlSG9zdC5nZXRNZXRhZGF0YShwcm9qZWN0TmFtZSk7XG5cbiAgICByZXR1cm4gbWV0YWRhdGE7XG4gIH1cblxuICBhc3luYyBsb2FkQnVpbGRlcihpbmZvOiBOb2RlTW9kdWxlc0J1aWxkZXJJbmZvKTogUHJvbWlzZTxCdWlsZGVyPiB7XG4gICAgY29uc3QgYnVpbGRlciA9IGF3YWl0IGdldEJ1aWxkZXIoaW5mby5pbXBvcnQpO1xuXG4gICAgaWYgKGJ1aWxkZXJbQnVpbGRlclN5bWJvbF0pIHtcbiAgICAgIHJldHVybiBidWlsZGVyO1xuICAgIH1cblxuICAgIC8vIERlZmF1bHQgaGFuZGxpbmcgY29kZSBpcyBmb3Igb2xkIGJ1aWxkZXJzIHRoYXQgaW5jb3JyZWN0bHkgZXhwb3J0IGBkZWZhdWx0YCB3aXRoIG5vbi1FU00gbW9kdWxlXG4gICAgaWYgKGJ1aWxkZXI/LmRlZmF1bHRbQnVpbGRlclN5bWJvbF0pIHtcbiAgICAgIHJldHVybiBidWlsZGVyLmRlZmF1bHQ7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IEVycm9yKCdCdWlsZGVyIGlzIG5vdCBhIGJ1aWxkZXInKTtcbiAgfVxufVxuXG4vKipcbiAqIFRoaXMgdXNlcyBhIGR5bmFtaWMgaW1wb3J0IHRvIGxvYWQgYSBtb2R1bGUgd2hpY2ggbWF5IGJlIEVTTS5cbiAqIENvbW1vbkpTIGNvZGUgY2FuIGxvYWQgRVNNIGNvZGUgdmlhIGEgZHluYW1pYyBpbXBvcnQuIFVuZm9ydHVuYXRlbHksIFR5cGVTY3JpcHRcbiAqIHdpbGwgY3VycmVudGx5LCB1bmNvbmRpdGlvbmFsbHkgZG93bmxldmVsIGR5bmFtaWMgaW1wb3J0IGludG8gYSByZXF1aXJlIGNhbGwuXG4gKiByZXF1aXJlIGNhbGxzIGNhbm5vdCBsb2FkIEVTTSBjb2RlIGFuZCB3aWxsIHJlc3VsdCBpbiBhIHJ1bnRpbWUgZXJyb3IuIFRvIHdvcmthcm91bmRcbiAqIHRoaXMsIGEgRnVuY3Rpb24gY29uc3RydWN0b3IgaXMgdXNlZCB0byBwcmV2ZW50IFR5cGVTY3JpcHQgZnJvbSBjaGFuZ2luZyB0aGUgZHluYW1pYyBpbXBvcnQuXG4gKiBPbmNlIFR5cGVTY3JpcHQgcHJvdmlkZXMgc3VwcG9ydCBmb3Iga2VlcGluZyB0aGUgZHluYW1pYyBpbXBvcnQgdGhpcyB3b3JrYXJvdW5kIGNhblxuICogYmUgZHJvcHBlZC5cbiAqXG4gKiBAcGFyYW0gbW9kdWxlUGF0aCBUaGUgcGF0aCBvZiB0aGUgbW9kdWxlIHRvIGxvYWQuXG4gKiBAcmV0dXJucyBBIFByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgZHluYW1pY2FsbHkgaW1wb3J0ZWQgbW9kdWxlLlxuICovXG5mdW5jdGlvbiBsb2FkRXNtTW9kdWxlPFQ+KG1vZHVsZVBhdGg6IHN0cmluZyB8IFVSTCk6IFByb21pc2U8VD4ge1xuICByZXR1cm4gbmV3IEZ1bmN0aW9uKCdtb2R1bGVQYXRoJywgYHJldHVybiBpbXBvcnQobW9kdWxlUGF0aCk7YCkobW9kdWxlUGF0aCkgYXMgUHJvbWlzZTxUPjtcbn1cblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmFzeW5jIGZ1bmN0aW9uIGdldEJ1aWxkZXIoYnVpbGRlclBhdGg6IHN0cmluZyk6IFByb21pc2U8YW55PiB7XG4gIHN3aXRjaCAocGF0aC5leHRuYW1lKGJ1aWxkZXJQYXRoKSkge1xuICAgIGNhc2UgJy5tanMnOlxuICAgICAgLy8gTG9hZCB0aGUgRVNNIGNvbmZpZ3VyYXRpb24gZmlsZSB1c2luZyB0aGUgVHlwZVNjcmlwdCBkeW5hbWljIGltcG9ydCB3b3JrYXJvdW5kLlxuICAgICAgLy8gT25jZSBUeXBlU2NyaXB0IHByb3ZpZGVzIHN1cHBvcnQgZm9yIGtlZXBpbmcgdGhlIGR5bmFtaWMgaW1wb3J0IHRoaXMgd29ya2Fyb3VuZCBjYW4gYmVcbiAgICAgIC8vIGNoYW5nZWQgdG8gYSBkaXJlY3QgZHluYW1pYyBpbXBvcnQuXG4gICAgICByZXR1cm4gKGF3YWl0IGxvYWRFc21Nb2R1bGU8eyBkZWZhdWx0OiB1bmtub3duIH0+KHBhdGhUb0ZpbGVVUkwoYnVpbGRlclBhdGgpKSkuZGVmYXVsdDtcbiAgICBjYXNlICcuY2pzJzpcbiAgICAgIHJldHVybiByZXF1aXJlKGJ1aWxkZXJQYXRoKTtcbiAgICBkZWZhdWx0OlxuICAgICAgLy8gVGhlIGZpbGUgY291bGQgYmUgZWl0aGVyIENvbW1vbkpTIG9yIEVTTS5cbiAgICAgIC8vIENvbW1vbkpTIGlzIHRyaWVkIGZpcnN0IHRoZW4gRVNNIGlmIGxvYWRpbmcgZmFpbHMuXG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gcmVxdWlyZShidWlsZGVyUGF0aCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmIChlLmNvZGUgPT09ICdFUlJfUkVRVUlSRV9FU00nKSB7XG4gICAgICAgICAgLy8gTG9hZCB0aGUgRVNNIGNvbmZpZ3VyYXRpb24gZmlsZSB1c2luZyB0aGUgVHlwZVNjcmlwdCBkeW5hbWljIGltcG9ydCB3b3JrYXJvdW5kLlxuICAgICAgICAgIC8vIE9uY2UgVHlwZVNjcmlwdCBwcm92aWRlcyBzdXBwb3J0IGZvciBrZWVwaW5nIHRoZSBkeW5hbWljIGltcG9ydCB0aGlzIHdvcmthcm91bmQgY2FuIGJlXG4gICAgICAgICAgLy8gY2hhbmdlZCB0byBhIGRpcmVjdCBkeW5hbWljIGltcG9ydC5cbiAgICAgICAgICByZXR1cm4gKGF3YWl0IGxvYWRFc21Nb2R1bGU8eyBkZWZhdWx0OiB1bmtub3duIH0+KHBhdGhUb0ZpbGVVUkwoYnVpbGRlclBhdGgpKSkuZGVmYXVsdDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gIH1cbn1cbiJdfQ==