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
        const builder = (await Promise.resolve().then(() => __importStar(require(info.import)))).default;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS1tb2R1bGVzLWFyY2hpdGVjdC1ob3N0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYXJjaGl0ZWN0L25vZGUvbm9kZS1tb2R1bGVzLWFyY2hpdGVjdC1ob3N0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFHSCwyQ0FBNkI7QUFDN0IsMkJBQTRDO0FBSTVDLDhDQUF3RTtBQU14RSxTQUFTLEtBQUssQ0FBQyxHQUFZO0lBQ3pCLElBQUk7UUFDRixPQUFPLElBQUEsZ0JBQVcsRUFBQyxJQUFBLGNBQVMsRUFBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0tBQ3BDO0lBQUMsV0FBTTtRQUNOLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7S0FDeEM7QUFDSCxDQUFDO0FBVUQsU0FBUyxpQkFBaUIsQ0FDeEIsU0FBeUMsRUFDekMsT0FBZSxFQUNmLE1BQWM7SUFFZCxNQUFNLGlCQUFpQixHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzFELElBQUksQ0FBQyxpQkFBaUIsRUFBRTtRQUN0QixNQUFNLElBQUksS0FBSyxDQUFDLFlBQVksT0FBTyxtQkFBbUIsQ0FBQyxDQUFDO0tBQ3pEO0lBRUQsTUFBTSxnQkFBZ0IsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQy9ELElBQUksQ0FBQyxnQkFBZ0IsRUFBRTtRQUNyQixNQUFNLElBQUksS0FBSyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7S0FDbkQ7SUFFRCxPQUFPLGdCQUFnQixDQUFDO0FBQzFCLENBQUM7QUFFRCxNQUFhLGlDQUFpQztJQU81QyxZQUNFLGVBQStELEVBQ3JELEtBQWE7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QWEsSUFBSSxjQUFjLEVBQUU7Z0JBQzFDLE9BQU8sR0FBRztvQkFDUixHQUFHLE9BQU87b0JBQ1YsR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsTUFBTSxFQUFFLGFBQWEsQ0FBQyxDQUFDO2lCQUN2RixDQUFDO2FBQ0g7U0FDRjtRQUVELE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBb0IsQ0FBQztJQUMzQyxDQUFDO0lBRUQsS0FBSyxDQUFDLGtCQUFrQixDQUFDLE1BQXVCO1FBQzlDLE1BQU0sV0FBVyxHQUFHLE9BQU8sTUFBTSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDO1FBQ3pFLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBRTdELE9BQU8sUUFBUSxDQUFDO0lBQ2xCLENBQUM7SUFFRCxLQUFLLENBQUMsV0FBVyxDQUFDLElBQTRCO1FBQzVDLE1BQU0sT0FBTyxHQUFHLENBQUMsd0RBQWEsSUFBSSxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1FBQ3BELElBQUksT0FBTyxDQUFDLHdCQUFhLENBQUMsRUFBRTtZQUMxQixPQUFPLE9BQU8sQ0FBQztTQUNoQjtRQUVELGtHQUFrRztRQUNsRyxJQUFJLE9BQU8sYUFBUCxPQUFPLHVCQUFQLE9BQU8sQ0FBRSxPQUFPLENBQUMsd0JBQWEsQ0FBQyxFQUFFO1lBQ25DLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQztTQUN4QjtRQUVELE1BQU0sSUFBSSxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztJQUM5QyxDQUFDO0NBQ0Y7QUE3SkQsOEVBNkpDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7IGpzb24sIHdvcmtzcGFjZXMgfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZSc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgZGVzZXJpYWxpemUsIHNlcmlhbGl6ZSB9IGZyb20gJ3Y4JztcbmltcG9ydCB7IEJ1aWxkZXJJbmZvIH0gZnJvbSAnLi4vc3JjJztcbmltcG9ydCB7IFNjaGVtYSBhcyBCdWlsZGVyU2NoZW1hIH0gZnJvbSAnLi4vc3JjL2J1aWxkZXJzLXNjaGVtYSc7XG5pbXBvcnQgeyBUYXJnZXQgfSBmcm9tICcuLi9zcmMvaW5wdXQtc2NoZW1hJztcbmltcG9ydCB7IEFyY2hpdGVjdEhvc3QsIEJ1aWxkZXIsIEJ1aWxkZXJTeW1ib2wgfSBmcm9tICcuLi9zcmMvaW50ZXJuYWwnO1xuXG5leHBvcnQgdHlwZSBOb2RlTW9kdWxlc0J1aWxkZXJJbmZvID0gQnVpbGRlckluZm8gJiB7XG4gIGltcG9ydDogc3RyaW5nO1xufTtcblxuZnVuY3Rpb24gY2xvbmUob2JqOiB1bmtub3duKTogdW5rbm93biB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGRlc2VyaWFsaXplKHNlcmlhbGl6ZShvYmopKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkob2JqKSk7XG4gIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3Jrc3BhY2VIb3N0IHtcbiAgZ2V0QnVpbGRlck5hbWUocHJvamVjdDogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPjtcbiAgZ2V0TWV0YWRhdGEocHJvamVjdDogc3RyaW5nKTogUHJvbWlzZTxqc29uLkpzb25PYmplY3Q+O1xuICBnZXRPcHRpb25zKHByb2plY3Q6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcsIGNvbmZpZ3VyYXRpb24/OiBzdHJpbmcpOiBQcm9taXNlPGpzb24uSnNvbk9iamVjdD47XG4gIGhhc1RhcmdldChwcm9qZWN0OiBzdHJpbmcsIHRhcmdldDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPjtcbiAgZ2V0RGVmYXVsdENvbmZpZ3VyYXRpb25OYW1lKHByb2plY3Q6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG59XG5cbmZ1bmN0aW9uIGZpbmRQcm9qZWN0VGFyZ2V0KFxuICB3b3Jrc3BhY2U6IHdvcmtzcGFjZXMuV29ya3NwYWNlRGVmaW5pdGlvbixcbiAgcHJvamVjdDogc3RyaW5nLFxuICB0YXJnZXQ6IHN0cmluZyxcbik6IHdvcmtzcGFjZXMuVGFyZ2V0RGVmaW5pdGlvbiB7XG4gIGNvbnN0IHByb2plY3REZWZpbml0aW9uID0gd29ya3NwYWNlLnByb2plY3RzLmdldChwcm9qZWN0KTtcbiAgaWYgKCFwcm9qZWN0RGVmaW5pdGlvbikge1xuICAgIHRocm93IG5ldyBFcnJvcihgUHJvamVjdCBcIiR7cHJvamVjdH1cIiBkb2VzIG5vdCBleGlzdC5gKTtcbiAgfVxuXG4gIGNvbnN0IHRhcmdldERlZmluaXRpb24gPSBwcm9qZWN0RGVmaW5pdGlvbi50YXJnZXRzLmdldCh0YXJnZXQpO1xuICBpZiAoIXRhcmdldERlZmluaXRpb24pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1Byb2plY3QgdGFyZ2V0IGRvZXMgbm90IGV4aXN0LicpO1xuICB9XG5cbiAgcmV0dXJuIHRhcmdldERlZmluaXRpb247XG59XG5cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VOb2RlTW9kdWxlc0FyY2hpdGVjdEhvc3QgaW1wbGVtZW50cyBBcmNoaXRlY3RIb3N0PE5vZGVNb2R1bGVzQnVpbGRlckluZm8+IHtcbiAgcHJpdmF0ZSB3b3Jrc3BhY2VIb3N0OiBXb3Jrc3BhY2VIb3N0O1xuXG4gIGNvbnN0cnVjdG9yKHdvcmtzcGFjZUhvc3Q6IFdvcmtzcGFjZUhvc3QsIF9yb290OiBzdHJpbmcpO1xuXG4gIGNvbnN0cnVjdG9yKHdvcmtzcGFjZTogd29ya3NwYWNlcy5Xb3Jrc3BhY2VEZWZpbml0aW9uLCBfcm9vdDogc3RyaW5nKTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICB3b3Jrc3BhY2VPckhvc3Q6IHdvcmtzcGFjZXMuV29ya3NwYWNlRGVmaW5pdGlvbiB8IFdvcmtzcGFjZUhvc3QsXG4gICAgcHJvdGVjdGVkIF9yb290OiBzdHJpbmcsXG4gICkge1xuICAgIGlmICgnZ2V0QnVpbGRlck5hbWUnIGluIHdvcmtzcGFjZU9ySG9zdCkge1xuICAgICAgdGhpcy53b3Jrc3BhY2VIb3N0ID0gd29ya3NwYWNlT3JIb3N0O1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLndvcmtzcGFjZUhvc3QgPSB7XG4gICAgICAgIGFzeW5jIGdldEJ1aWxkZXJOYW1lKHByb2plY3QsIHRhcmdldCkge1xuICAgICAgICAgIGNvbnN0IHRhcmdldERlZmluaXRpb24gPSBmaW5kUHJvamVjdFRhcmdldCh3b3Jrc3BhY2VPckhvc3QsIHByb2plY3QsIHRhcmdldCk7XG5cbiAgICAgICAgICByZXR1cm4gdGFyZ2V0RGVmaW5pdGlvbi5idWlsZGVyO1xuICAgICAgICB9LFxuICAgICAgICBhc3luYyBnZXRPcHRpb25zKHByb2plY3QsIHRhcmdldCwgY29uZmlndXJhdGlvbikge1xuICAgICAgICAgIGNvbnN0IHRhcmdldERlZmluaXRpb24gPSBmaW5kUHJvamVjdFRhcmdldCh3b3Jrc3BhY2VPckhvc3QsIHByb2plY3QsIHRhcmdldCk7XG5cbiAgICAgICAgICBpZiAoY29uZmlndXJhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gKHRhcmdldERlZmluaXRpb24ub3B0aW9ucyA/PyB7fSkgYXMganNvbi5Kc29uT2JqZWN0O1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICghdGFyZ2V0RGVmaW5pdGlvbi5jb25maWd1cmF0aW9ucz8uW2NvbmZpZ3VyYXRpb25dKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvbmZpZ3VyYXRpb24gJyR7Y29uZmlndXJhdGlvbn0nIGlzIG5vdCBzZXQgaW4gdGhlIHdvcmtzcGFjZS5gKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gKHRhcmdldERlZmluaXRpb24uY29uZmlndXJhdGlvbnM/Lltjb25maWd1cmF0aW9uXSA/PyB7fSkgYXMganNvbi5Kc29uT2JqZWN0O1xuICAgICAgICB9LFxuICAgICAgICBhc3luYyBnZXRNZXRhZGF0YShwcm9qZWN0KSB7XG4gICAgICAgICAgY29uc3QgcHJvamVjdERlZmluaXRpb24gPSB3b3Jrc3BhY2VPckhvc3QucHJvamVjdHMuZ2V0KHByb2plY3QpO1xuICAgICAgICAgIGlmICghcHJvamVjdERlZmluaXRpb24pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgUHJvamVjdCBcIiR7cHJvamVjdH1cIiBkb2VzIG5vdCBleGlzdC5gKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcm9vdDogcHJvamVjdERlZmluaXRpb24ucm9vdCxcbiAgICAgICAgICAgIHNvdXJjZVJvb3Q6IHByb2plY3REZWZpbml0aW9uLnNvdXJjZVJvb3QsXG4gICAgICAgICAgICBwcmVmaXg6IHByb2plY3REZWZpbml0aW9uLnByZWZpeCxcbiAgICAgICAgICAgIC4uLihjbG9uZSh3b3Jrc3BhY2VPckhvc3QuZXh0ZW5zaW9ucykgYXMge30pLFxuICAgICAgICAgICAgLi4uKGNsb25lKHByb2plY3REZWZpbml0aW9uLmV4dGVuc2lvbnMpIGFzIHt9KSxcbiAgICAgICAgICB9IGFzIHVua25vd24gYXMganNvbi5Kc29uT2JqZWN0O1xuICAgICAgICB9LFxuICAgICAgICBhc3luYyBoYXNUYXJnZXQocHJvamVjdCwgdGFyZ2V0KSB7XG4gICAgICAgICAgcmV0dXJuICEhd29ya3NwYWNlT3JIb3N0LnByb2plY3RzLmdldChwcm9qZWN0KT8udGFyZ2V0cy5oYXModGFyZ2V0KTtcbiAgICAgICAgfSxcbiAgICAgICAgYXN5bmMgZ2V0RGVmYXVsdENvbmZpZ3VyYXRpb25OYW1lKHByb2plY3QsIHRhcmdldCkge1xuICAgICAgICAgIHJldHVybiB3b3Jrc3BhY2VPckhvc3QucHJvamVjdHMuZ2V0KHByb2plY3QpPy50YXJnZXRzLmdldCh0YXJnZXQpPy5kZWZhdWx0Q29uZmlndXJhdGlvbjtcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZ2V0QnVpbGRlck5hbWVGb3JUYXJnZXQodGFyZ2V0OiBUYXJnZXQpIHtcbiAgICByZXR1cm4gdGhpcy53b3Jrc3BhY2VIb3N0LmdldEJ1aWxkZXJOYW1lKHRhcmdldC5wcm9qZWN0LCB0YXJnZXQudGFyZ2V0KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNvbHZlIGEgYnVpbGRlci4gVGhpcyBuZWVkcyB0byBiZSBhIHN0cmluZyB3aGljaCB3aWxsIGJlIHVzZWQgaW4gYSBkeW5hbWljIGBpbXBvcnQoKWBcbiAgICogY2xhdXNlLiBUaGlzIHNob3VsZCB0aHJvdyBpZiBubyBidWlsZGVyIGNhbiBiZSBmb3VuZC4gVGhlIGR5bmFtaWMgaW1wb3J0IHdpbGwgdGhyb3cgaWZcbiAgICogaXQgaXMgdW5zdXBwb3J0ZWQuXG4gICAqIEBwYXJhbSBidWlsZGVyU3RyIFRoZSBuYW1lIG9mIHRoZSBidWlsZGVyIHRvIGJlIHVzZWQuXG4gICAqIEByZXR1cm5zIEFsbCB0aGUgaW5mbyBuZWVkZWQgZm9yIHRoZSBidWlsZGVyIGl0c2VsZi5cbiAgICovXG4gIHJlc29sdmVCdWlsZGVyKGJ1aWxkZXJTdHI6IHN0cmluZyk6IFByb21pc2U8Tm9kZU1vZHVsZXNCdWlsZGVySW5mbz4ge1xuICAgIGNvbnN0IFtwYWNrYWdlTmFtZSwgYnVpbGRlck5hbWVdID0gYnVpbGRlclN0ci5zcGxpdCgnOicsIDIpO1xuICAgIGlmICghYnVpbGRlck5hbWUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gYnVpbGRlciBuYW1lIHNwZWNpZmllZC4nKTtcbiAgICB9XG5cbiAgICBjb25zdCBwYWNrYWdlSnNvblBhdGggPSByZXF1aXJlLnJlc29sdmUocGFja2FnZU5hbWUgKyAnL3BhY2thZ2UuanNvbicsIHtcbiAgICAgIHBhdGhzOiBbdGhpcy5fcm9vdF0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBwYWNrYWdlSnNvbiA9IHJlcXVpcmUocGFja2FnZUpzb25QYXRoKTtcbiAgICBpZiAoIXBhY2thZ2VKc29uWydidWlsZGVycyddKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFBhY2thZ2UgJHtKU09OLnN0cmluZ2lmeShwYWNrYWdlTmFtZSl9IGhhcyBubyBidWlsZGVycyBkZWZpbmVkLmApO1xuICAgIH1cblxuICAgIGNvbnN0IGJ1aWxkZXJKc29uUGF0aCA9IHBhdGgucmVzb2x2ZShwYXRoLmRpcm5hbWUocGFja2FnZUpzb25QYXRoKSwgcGFja2FnZUpzb25bJ2J1aWxkZXJzJ10pO1xuICAgIGNvbnN0IGJ1aWxkZXJKc29uID0gcmVxdWlyZShidWlsZGVySnNvblBhdGgpIGFzIEJ1aWxkZXJTY2hlbWE7XG5cbiAgICBjb25zdCBidWlsZGVyID0gYnVpbGRlckpzb24uYnVpbGRlcnMgJiYgYnVpbGRlckpzb24uYnVpbGRlcnNbYnVpbGRlck5hbWVdO1xuXG4gICAgaWYgKCFidWlsZGVyKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBmaW5kIGJ1aWxkZXIgJHtKU09OLnN0cmluZ2lmeShidWlsZGVyU3RyKX0uYCk7XG4gICAgfVxuXG4gICAgY29uc3QgaW1wb3J0UGF0aCA9IGJ1aWxkZXIuaW1wbGVtZW50YXRpb247XG4gICAgaWYgKCFpbXBvcnRQYXRoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBmaW5kIHRoZSBpbXBsZW1lbnRhdGlvbiBmb3IgYnVpbGRlciAnICsgYnVpbGRlclN0cik7XG4gICAgfVxuXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICBuYW1lOiBidWlsZGVyU3RyLFxuICAgICAgYnVpbGRlck5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogYnVpbGRlclsnZGVzY3JpcHRpb24nXSxcbiAgICAgIG9wdGlvblNjaGVtYTogcmVxdWlyZShwYXRoLnJlc29sdmUocGF0aC5kaXJuYW1lKGJ1aWxkZXJKc29uUGF0aCksIGJ1aWxkZXIuc2NoZW1hKSksXG4gICAgICBpbXBvcnQ6IHBhdGgucmVzb2x2ZShwYXRoLmRpcm5hbWUoYnVpbGRlckpzb25QYXRoKSwgaW1wb3J0UGF0aCksXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBnZXRDdXJyZW50RGlyZWN0b3J5KCkge1xuICAgIHJldHVybiBwcm9jZXNzLmN3ZCgpO1xuICB9XG5cbiAgYXN5bmMgZ2V0V29ya3NwYWNlUm9vdCgpIHtcbiAgICByZXR1cm4gdGhpcy5fcm9vdDtcbiAgfVxuXG4gIGFzeW5jIGdldE9wdGlvbnNGb3JUYXJnZXQodGFyZ2V0OiBUYXJnZXQpOiBQcm9taXNlPGpzb24uSnNvbk9iamVjdCB8IG51bGw+IHtcbiAgICBpZiAoIShhd2FpdCB0aGlzLndvcmtzcGFjZUhvc3QuaGFzVGFyZ2V0KHRhcmdldC5wcm9qZWN0LCB0YXJnZXQudGFyZ2V0KSkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGxldCBvcHRpb25zID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VIb3N0LmdldE9wdGlvbnModGFyZ2V0LnByb2plY3QsIHRhcmdldC50YXJnZXQpO1xuICAgIGNvbnN0IHRhcmdldENvbmZpZ3VyYXRpb24gPVxuICAgICAgdGFyZ2V0LmNvbmZpZ3VyYXRpb24gfHxcbiAgICAgIChhd2FpdCB0aGlzLndvcmtzcGFjZUhvc3QuZ2V0RGVmYXVsdENvbmZpZ3VyYXRpb25OYW1lKHRhcmdldC5wcm9qZWN0LCB0YXJnZXQudGFyZ2V0KSk7XG5cbiAgICBpZiAodGFyZ2V0Q29uZmlndXJhdGlvbikge1xuICAgICAgY29uc3QgY29uZmlndXJhdGlvbnMgPSB0YXJnZXRDb25maWd1cmF0aW9uLnNwbGl0KCcsJykubWFwKChjKSA9PiBjLnRyaW0oKSk7XG4gICAgICBmb3IgKGNvbnN0IGNvbmZpZ3VyYXRpb24gb2YgY29uZmlndXJhdGlvbnMpIHtcbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICAuLi5vcHRpb25zLFxuICAgICAgICAgIC4uLihhd2FpdCB0aGlzLndvcmtzcGFjZUhvc3QuZ2V0T3B0aW9ucyh0YXJnZXQucHJvamVjdCwgdGFyZ2V0LnRhcmdldCwgY29uZmlndXJhdGlvbikpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBjbG9uZShvcHRpb25zKSBhcyBqc29uLkpzb25PYmplY3Q7XG4gIH1cblxuICBhc3luYyBnZXRQcm9qZWN0TWV0YWRhdGEodGFyZ2V0OiBUYXJnZXQgfCBzdHJpbmcpOiBQcm9taXNlPGpzb24uSnNvbk9iamVjdCB8IG51bGw+IHtcbiAgICBjb25zdCBwcm9qZWN0TmFtZSA9IHR5cGVvZiB0YXJnZXQgPT09ICdzdHJpbmcnID8gdGFyZ2V0IDogdGFyZ2V0LnByb2plY3Q7XG4gICAgY29uc3QgbWV0YWRhdGEgPSB0aGlzLndvcmtzcGFjZUhvc3QuZ2V0TWV0YWRhdGEocHJvamVjdE5hbWUpO1xuXG4gICAgcmV0dXJuIG1ldGFkYXRhO1xuICB9XG5cbiAgYXN5bmMgbG9hZEJ1aWxkZXIoaW5mbzogTm9kZU1vZHVsZXNCdWlsZGVySW5mbyk6IFByb21pc2U8QnVpbGRlcj4ge1xuICAgIGNvbnN0IGJ1aWxkZXIgPSAoYXdhaXQgaW1wb3J0KGluZm8uaW1wb3J0KSkuZGVmYXVsdDtcbiAgICBpZiAoYnVpbGRlcltCdWlsZGVyU3ltYm9sXSkge1xuICAgICAgcmV0dXJuIGJ1aWxkZXI7XG4gICAgfVxuXG4gICAgLy8gRGVmYXVsdCBoYW5kbGluZyBjb2RlIGlzIGZvciBvbGQgYnVpbGRlcnMgdGhhdCBpbmNvcnJlY3RseSBleHBvcnQgYGRlZmF1bHRgIHdpdGggbm9uLUVTTSBtb2R1bGVcbiAgICBpZiAoYnVpbGRlcj8uZGVmYXVsdFtCdWlsZGVyU3ltYm9sXSkge1xuICAgICAgcmV0dXJuIGJ1aWxkZXIuZGVmYXVsdDtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0J1aWxkZXIgaXMgbm90IGEgYnVpbGRlcicpO1xuICB9XG59XG4iXX0=