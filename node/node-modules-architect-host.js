"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("@angular-devkit/core/node");
const path = require("path");
const internal_1 = require("../src/internal");
// TODO: create a base class for all workspace related hosts.
class WorkspaceNodeModulesArchitectHost {
    constructor(_workspace, _root) {
        this._workspace = _workspace;
        this._root = _root;
    }
    async getBuilderNameForTarget(target) {
        return this._workspace.getProjectTargets(target.project)[target.target]['builder'];
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
        const packageJsonPath = node_1.resolve(packageName, {
            basedir: this._root,
            checkLocal: true,
            checkGlobal: true,
            resolvePackageJson: true,
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
        const targetSpec = this._workspace.getProjectTargets(target.project)[target.target];
        if (targetSpec === undefined) {
            return null;
        }
        if (target.configuration && !targetSpec['configurations']) {
            throw new Error('Configuration not set in the workspace.');
        }
        return Object.assign({}, targetSpec['options'], (target.configuration ? targetSpec['configurations'][target.configuration] : 0));
    }
    async loadBuilder(info) {
        const builder = (await Promise.resolve().then(() => require(info.import))).default;
        if (builder[internal_1.BuilderSymbol]) {
            return builder;
        }
        throw new Error('Builder is not a builder');
    }
}
exports.WorkspaceNodeModulesArchitectHost = WorkspaceNodeModulesArchitectHost;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS1tb2R1bGVzLWFyY2hpdGVjdC1ob3N0LmpzIiwic291cmNlUm9vdCI6Ii4vIiwic291cmNlcyI6WyJwYWNrYWdlcy9hbmd1bGFyX2RldmtpdC9hcmNoaXRlY3Qvbm9kZS9ub2RlLW1vZHVsZXMtYXJjaGl0ZWN0LWhvc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFRQSxvREFBb0Q7QUFDcEQsNkJBQTZCO0FBSTdCLDhDQUF3RTtBQVF4RSw2REFBNkQ7QUFDN0QsTUFBYSxpQ0FBaUM7SUFDNUMsWUFDWSxVQUE0QyxFQUM1QyxLQUFhO1FBRGIsZUFBVSxHQUFWLFVBQVUsQ0FBa0M7UUFDNUMsVUFBSyxHQUFMLEtBQUssQ0FBUTtJQUN0QixDQUFDO0lBRUosS0FBSyxDQUFDLHVCQUF1QixDQUFDLE1BQWM7UUFDMUMsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDckYsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNILGNBQWMsQ0FBQyxVQUFrQjtRQUMvQixNQUFNLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzVELElBQUksQ0FBQyxXQUFXLEVBQUU7WUFDaEIsTUFBTSxJQUFJLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1NBQy9DO1FBRUQsTUFBTSxlQUFlLEdBQUcsY0FBTyxDQUFDLFdBQVcsRUFBRTtZQUMzQyxPQUFPLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDbkIsVUFBVSxFQUFFLElBQUk7WUFDaEIsV0FBVyxFQUFFLElBQUk7WUFDakIsa0JBQWtCLEVBQUUsSUFBSTtTQUN6QixDQUFDLENBQUM7UUFFSCxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsRUFBRTtZQUM1QixNQUFNLElBQUksS0FBSyxDQUFDLFdBQVcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsMkJBQTJCLENBQUMsQ0FBQztTQUNwRjtRQUVELE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsRUFBRSxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUM3RixNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFrQixDQUFDO1FBRTlELE1BQU0sT0FBTyxHQUFHLFdBQVcsQ0FBQyxRQUFRLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUUxRSxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQ1osTUFBTSxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDdkU7UUFFRCxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDO1FBQzFDLElBQUksQ0FBQyxVQUFVLEVBQUU7WUFDZixNQUFNLElBQUksS0FBSyxDQUFDLGdEQUFnRCxHQUFHLFVBQVUsQ0FBQyxDQUFDO1NBQ2hGO1FBRUQsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDO1lBQ3JCLElBQUksRUFBRSxVQUFVO1lBQ2hCLFdBQVc7WUFDWCxXQUFXLEVBQUUsT0FBTyxDQUFDLGFBQWEsQ0FBQztZQUNuQyxZQUFZLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDbEYsTUFBTSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsRUFBRSxVQUFVLENBQUM7U0FDaEUsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUI7UUFDdkIsT0FBTyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDdkIsQ0FBQztJQUVELEtBQUssQ0FBQyxnQkFBZ0I7UUFDcEIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDO0lBQ3BCLENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CLENBQUMsTUFBYztRQUN0QyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEYsSUFBSSxVQUFVLEtBQUssU0FBUyxFQUFFO1lBQzVCLE9BQU8sSUFBSSxDQUFDO1NBQ2I7UUFDRCxJQUFJLE1BQU0sQ0FBQyxhQUFhLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsRUFBRTtZQUN6RCxNQUFNLElBQUksS0FBSyxDQUFDLHlDQUF5QyxDQUFDLENBQUM7U0FDNUQ7UUFFRCx5QkFDSyxVQUFVLENBQUMsU0FBUyxDQUFDLEVBQ3JCLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDbEY7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUE0QjtRQUM1QyxNQUFNLE9BQU8sR0FBRyxDQUFDLDJDQUFhLElBQUksQ0FBQyxNQUFNLEVBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUNwRCxJQUFJLE9BQU8sQ0FBQyx3QkFBYSxDQUFDLEVBQUU7WUFDMUIsT0FBTyxPQUFPLENBQUM7U0FDaEI7UUFFRCxNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7SUFDOUMsQ0FBQztDQUNGO0FBekZELDhFQXlGQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cbmltcG9ydCB7IGV4cGVyaW1lbnRhbCwganNvbiB9IGZyb20gJ0Bhbmd1bGFyLWRldmtpdC9jb3JlJztcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZS9ub2RlJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBTY2hlbWEgYXMgQnVpbGRlclNjaGVtYSB9IGZyb20gJy4uL3NyYy9idWlsZGVycy1zY2hlbWEnO1xuaW1wb3J0IHsgQnVpbGRlckluZm8gfSBmcm9tICcuLi9zcmMvaW5kZXgyJztcbmltcG9ydCB7IFRhcmdldCB9IGZyb20gJy4uL3NyYy9pbnB1dC1zY2hlbWEnO1xuaW1wb3J0IHsgQXJjaGl0ZWN0SG9zdCwgQnVpbGRlciwgQnVpbGRlclN5bWJvbCB9IGZyb20gJy4uL3NyYy9pbnRlcm5hbCc7XG5cblxuZXhwb3J0IHR5cGUgTm9kZU1vZHVsZXNCdWlsZGVySW5mbyA9IEJ1aWxkZXJJbmZvICYge1xuICBpbXBvcnQ6IHN0cmluZztcbn07XG5cblxuLy8gVE9ETzogY3JlYXRlIGEgYmFzZSBjbGFzcyBmb3IgYWxsIHdvcmtzcGFjZSByZWxhdGVkIGhvc3RzLlxuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZU5vZGVNb2R1bGVzQXJjaGl0ZWN0SG9zdCBpbXBsZW1lbnRzIEFyY2hpdGVjdEhvc3Q8Tm9kZU1vZHVsZXNCdWlsZGVySW5mbz4ge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcm90ZWN0ZWQgX3dvcmtzcGFjZTogZXhwZXJpbWVudGFsLndvcmtzcGFjZS5Xb3Jrc3BhY2UsXG4gICAgcHJvdGVjdGVkIF9yb290OiBzdHJpbmcsXG4gICkge31cblxuICBhc3luYyBnZXRCdWlsZGVyTmFtZUZvclRhcmdldCh0YXJnZXQ6IFRhcmdldCkge1xuICAgIHJldHVybiB0aGlzLl93b3Jrc3BhY2UuZ2V0UHJvamVjdFRhcmdldHModGFyZ2V0LnByb2plY3QpW3RhcmdldC50YXJnZXRdWydidWlsZGVyJ107XG4gIH1cblxuICAvKipcbiAgICogUmVzb2x2ZSBhIGJ1aWxkZXIuIFRoaXMgbmVlZHMgdG8gYmUgYSBzdHJpbmcgd2hpY2ggd2lsbCBiZSB1c2VkIGluIGEgZHluYW1pYyBgaW1wb3J0KClgXG4gICAqIGNsYXVzZS4gVGhpcyBzaG91bGQgdGhyb3cgaWYgbm8gYnVpbGRlciBjYW4gYmUgZm91bmQuIFRoZSBkeW5hbWljIGltcG9ydCB3aWxsIHRocm93IGlmXG4gICAqIGl0IGlzIHVuc3VwcG9ydGVkLlxuICAgKiBAcGFyYW0gYnVpbGRlclN0ciBUaGUgbmFtZSBvZiB0aGUgYnVpbGRlciB0byBiZSB1c2VkLlxuICAgKiBAcmV0dXJucyBBbGwgdGhlIGluZm8gbmVlZGVkIGZvciB0aGUgYnVpbGRlciBpdHNlbGYuXG4gICAqL1xuICByZXNvbHZlQnVpbGRlcihidWlsZGVyU3RyOiBzdHJpbmcpOiBQcm9taXNlPE5vZGVNb2R1bGVzQnVpbGRlckluZm8+IHtcbiAgICBjb25zdCBbcGFja2FnZU5hbWUsIGJ1aWxkZXJOYW1lXSA9IGJ1aWxkZXJTdHIuc3BsaXQoJzonLCAyKTtcbiAgICBpZiAoIWJ1aWxkZXJOYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGJ1aWxkZXIgbmFtZSBzcGVjaWZpZWQuJyk7XG4gICAgfVxuXG4gICAgY29uc3QgcGFja2FnZUpzb25QYXRoID0gcmVzb2x2ZShwYWNrYWdlTmFtZSwge1xuICAgICAgYmFzZWRpcjogdGhpcy5fcm9vdCxcbiAgICAgIGNoZWNrTG9jYWw6IHRydWUsXG4gICAgICBjaGVja0dsb2JhbDogdHJ1ZSxcbiAgICAgIHJlc29sdmVQYWNrYWdlSnNvbjogdHJ1ZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHBhY2thZ2VKc29uID0gcmVxdWlyZShwYWNrYWdlSnNvblBhdGgpO1xuICAgIGlmICghcGFja2FnZUpzb25bJ2J1aWxkZXJzJ10pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgUGFja2FnZSAke0pTT04uc3RyaW5naWZ5KHBhY2thZ2VOYW1lKX0gaGFzIG5vIGJ1aWxkZXJzIGRlZmluZWQuYCk7XG4gICAgfVxuXG4gICAgY29uc3QgYnVpbGRlckpzb25QYXRoID0gcGF0aC5yZXNvbHZlKHBhdGguZGlybmFtZShwYWNrYWdlSnNvblBhdGgpLCBwYWNrYWdlSnNvblsnYnVpbGRlcnMnXSk7XG4gICAgY29uc3QgYnVpbGRlckpzb24gPSByZXF1aXJlKGJ1aWxkZXJKc29uUGF0aCkgYXMgQnVpbGRlclNjaGVtYTtcblxuICAgIGNvbnN0IGJ1aWxkZXIgPSBidWlsZGVySnNvbi5idWlsZGVycyAmJiBidWlsZGVySnNvbi5idWlsZGVyc1tidWlsZGVyTmFtZV07XG5cbiAgICBpZiAoIWJ1aWxkZXIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGZpbmQgYnVpbGRlciAke0pTT04uc3RyaW5naWZ5KGJ1aWxkZXJTdHIpfS5gKTtcbiAgICB9XG5cbiAgICBjb25zdCBpbXBvcnRQYXRoID0gYnVpbGRlci5pbXBsZW1lbnRhdGlvbjtcbiAgICBpZiAoIWltcG9ydFBhdGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGZpbmQgdGhlIGltcGxlbWVudGF0aW9uIGZvciBidWlsZGVyICcgKyBidWlsZGVyU3RyKTtcbiAgICB9XG5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgIG5hbWU6IGJ1aWxkZXJTdHIsXG4gICAgICBidWlsZGVyTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiBidWlsZGVyWydkZXNjcmlwdGlvbiddLFxuICAgICAgb3B0aW9uU2NoZW1hOiByZXF1aXJlKHBhdGgucmVzb2x2ZShwYXRoLmRpcm5hbWUoYnVpbGRlckpzb25QYXRoKSwgYnVpbGRlci5zY2hlbWEpKSxcbiAgICAgIGltcG9ydDogcGF0aC5yZXNvbHZlKHBhdGguZGlybmFtZShidWlsZGVySnNvblBhdGgpLCBpbXBvcnRQYXRoKSxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGdldEN1cnJlbnREaXJlY3RvcnkoKSB7XG4gICAgcmV0dXJuIHByb2Nlc3MuY3dkKCk7XG4gIH1cblxuICBhc3luYyBnZXRXb3Jrc3BhY2VSb290KCkge1xuICAgIHJldHVybiB0aGlzLl9yb290O1xuICB9XG5cbiAgYXN5bmMgZ2V0T3B0aW9uc0ZvclRhcmdldCh0YXJnZXQ6IFRhcmdldCk6IFByb21pc2U8anNvbi5Kc29uT2JqZWN0IHwgbnVsbD4ge1xuICAgIGNvbnN0IHRhcmdldFNwZWMgPSB0aGlzLl93b3Jrc3BhY2UuZ2V0UHJvamVjdFRhcmdldHModGFyZ2V0LnByb2plY3QpW3RhcmdldC50YXJnZXRdO1xuICAgIGlmICh0YXJnZXRTcGVjID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBpZiAodGFyZ2V0LmNvbmZpZ3VyYXRpb24gJiYgIXRhcmdldFNwZWNbJ2NvbmZpZ3VyYXRpb25zJ10pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ29uZmlndXJhdGlvbiBub3Qgc2V0IGluIHRoZSB3b3Jrc3BhY2UuJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIC4uLnRhcmdldFNwZWNbJ29wdGlvbnMnXSxcbiAgICAgIC4uLih0YXJnZXQuY29uZmlndXJhdGlvbiA/IHRhcmdldFNwZWNbJ2NvbmZpZ3VyYXRpb25zJ11bdGFyZ2V0LmNvbmZpZ3VyYXRpb25dIDogMCksXG4gICAgfTtcbiAgfVxuXG4gIGFzeW5jIGxvYWRCdWlsZGVyKGluZm86IE5vZGVNb2R1bGVzQnVpbGRlckluZm8pOiBQcm9taXNlPEJ1aWxkZXI+IHtcbiAgICBjb25zdCBidWlsZGVyID0gKGF3YWl0IGltcG9ydChpbmZvLmltcG9ydCkpLmRlZmF1bHQ7XG4gICAgaWYgKGJ1aWxkZXJbQnVpbGRlclN5bWJvbF0pIHtcbiAgICAgIHJldHVybiBidWlsZGVyO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBFcnJvcignQnVpbGRlciBpcyBub3QgYSBidWlsZGVyJyk7XG4gIH1cbn1cbiJdfQ==