"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index2_1 = require("../src/index2");
class TestingArchitectHost {
    /**
     * Can provide a backend host, in case of integration tests.
     * @param workspaceRoot The workspace root to use.
     * @param currentDirectory The current directory to use.
     * @param _backendHost A host to defer calls that aren't resolved here.
     */
    constructor(workspaceRoot = '', currentDirectory = workspaceRoot, _backendHost = null) {
        this.workspaceRoot = workspaceRoot;
        this.currentDirectory = currentDirectory;
        this._backendHost = _backendHost;
        this._builderImportMap = new Map();
        this._builderMap = new Map();
        this._targetMap = new Map();
    }
    addBuilder(builderName, builder, description = 'Testing only builder.', optionSchema = { type: 'object' }) {
        this._builderImportMap.set(builderName, builder);
        this._builderMap.set(builderName, { builderName, description, optionSchema });
    }
    async addBuilderFromPackage(packageName) {
        const packageJson = await Promise.resolve().then(() => require(packageName + '/package.json'));
        if (!('builders' in packageJson)) {
            throw new Error('Invalid package.json, builders key not found.');
        }
        const builderJsonPath = packageName + '/' + packageJson['builders'];
        const builderJson = await Promise.resolve().then(() => require(builderJsonPath));
        const builders = builderJson['builders'];
        if (!builders) {
            throw new Error('Invalid builders.json, builders key not found.');
        }
        for (const builderName of Object.keys(builders)) {
            const b = builders[builderName];
            // TODO: remove this check as v1 is not supported anymore.
            if (!b.implementation) {
                continue;
            }
            const handler = await Promise.resolve().then(() => require(builderJsonPath + '/../' + b.implementation));
            const optionsSchema = await Promise.resolve().then(() => require(builderJsonPath + '/../' + b.schema));
            this.addBuilder(builderName, handler, b.description, optionsSchema);
        }
    }
    addTarget(target, builderName, options = {}) {
        this._targetMap.set(index2_1.targetStringFromTarget(target), { builderName, options });
    }
    async getBuilderNameForTarget(target) {
        const name = index2_1.targetStringFromTarget(target);
        const maybeTarget = this._targetMap.get(name);
        if (!maybeTarget) {
            return this._backendHost && this._backendHost.getBuilderNameForTarget(target);
        }
        return maybeTarget.builderName;
    }
    /**
     * Resolve a builder. This needs to return a string which will be used in a dynamic `import()`
     * clause. This should throw if no builder can be found. The dynamic import will throw if
     * it is unsupported.
     * @param builderName The name of the builder to be used.
     * @returns All the info needed for the builder itself.
     */
    async resolveBuilder(builderName) {
        return this._builderMap.get(builderName)
            || (this._backendHost && this._backendHost.resolveBuilder(builderName));
    }
    async getCurrentDirectory() {
        return this.currentDirectory;
    }
    async getWorkspaceRoot() {
        return this.workspaceRoot;
    }
    async getOptionsForTarget(target) {
        const name = index2_1.targetStringFromTarget(target);
        const maybeTarget = this._targetMap.get(name);
        if (!maybeTarget) {
            return this._backendHost && this._backendHost.getOptionsForTarget(target);
        }
        return maybeTarget.options;
    }
    async loadBuilder(info) {
        return this._builderImportMap.get(info.builderName)
            || (this._backendHost && this._backendHost.loadBuilder(info));
    }
}
exports.TestingArchitectHost = TestingArchitectHost;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZy1hcmNoaXRlY3QtaG9zdC5qcyIsInNvdXJjZVJvb3QiOiIuLyIsInNvdXJjZXMiOlsicGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYXJjaGl0ZWN0L3Rlc3RpbmcvdGVzdGluZy1hcmNoaXRlY3QtaG9zdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQVFBLDBDQUE0RTtBQUc1RSxNQUFhLG9CQUFvQjtJQUsvQjs7Ozs7T0FLRztJQUNILFlBQ1MsZ0JBQWdCLEVBQUUsRUFDbEIsbUJBQW1CLGFBQWEsRUFDL0IsZUFBcUMsSUFBSTtRQUYxQyxrQkFBYSxHQUFiLGFBQWEsQ0FBSztRQUNsQixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQWdCO1FBQy9CLGlCQUFZLEdBQVosWUFBWSxDQUE2QjtRQWIzQyxzQkFBaUIsR0FBRyxJQUFJLEdBQUcsRUFBbUIsQ0FBQztRQUMvQyxnQkFBVyxHQUFHLElBQUksR0FBRyxFQUF1QixDQUFDO1FBQzdDLGVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBNkQsQ0FBQztJQVl2RixDQUFDO0lBRUosVUFBVSxDQUNSLFdBQW1CLEVBQ25CLE9BQWdCLEVBQ2hCLFdBQVcsR0FBRyx1QkFBdUIsRUFDckMsZUFBdUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO1FBRXpELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ2pELElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBQ0QsS0FBSyxDQUFDLHFCQUFxQixDQUFDLFdBQW1CO1FBQzdDLE1BQU0sV0FBVyxHQUFHLDJDQUFhLFdBQVcsR0FBRyxlQUFlLEVBQUMsQ0FBQztRQUNoRSxJQUFJLENBQUMsQ0FBQyxVQUFVLElBQUksV0FBVyxDQUFDLEVBQUU7WUFDaEMsTUFBTSxJQUFJLEtBQUssQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDO1NBQ2xFO1FBRUQsTUFBTSxlQUFlLEdBQUcsV0FBVyxHQUFHLEdBQUcsR0FBRyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDcEUsTUFBTSxXQUFXLEdBQUcsMkNBQWEsZUFBZSxFQUFDLENBQUM7UUFDbEQsTUFBTSxRQUFRLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxRQUFRLEVBQUU7WUFDYixNQUFNLElBQUksS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7U0FDbkU7UUFFRCxLQUFLLE1BQU0sV0FBVyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDL0MsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ2hDLDBEQUEwRDtZQUMxRCxJQUFJLENBQUMsQ0FBQyxDQUFDLGNBQWMsRUFBRTtnQkFBRSxTQUFTO2FBQUU7WUFDcEMsTUFBTSxPQUFPLEdBQUcsMkNBQWEsZUFBZSxHQUFHLE1BQU0sR0FBRyxDQUFDLENBQUMsY0FBYyxFQUFDLENBQUM7WUFDMUUsTUFBTSxhQUFhLEdBQUcsMkNBQWEsZUFBZSxHQUFHLE1BQU0sR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFDLENBQUM7WUFDeEUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxXQUFXLEVBQUUsYUFBYSxDQUFDLENBQUM7U0FDckU7SUFDSCxDQUFDO0lBQ0QsU0FBUyxDQUFDLE1BQWMsRUFBRSxXQUFtQixFQUFFLFVBQTJCLEVBQUU7UUFDMUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsK0JBQXNCLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBRUQsS0FBSyxDQUFDLHVCQUF1QixDQUFDLE1BQWM7UUFDMUMsTUFBTSxJQUFJLEdBQUcsK0JBQXNCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDNUMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDOUMsSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNoQixPQUFPLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUMvRTtRQUVELE9BQU8sV0FBVyxDQUFDLFdBQVcsQ0FBQztJQUNqQyxDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0gsS0FBSyxDQUFDLGNBQWMsQ0FBQyxXQUFtQjtRQUN0QyxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQztlQUNqQyxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUM5RSxDQUFDO0lBRUQsS0FBSyxDQUFDLG1CQUFtQjtRQUN2QixPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztJQUMvQixDQUFDO0lBQ0QsS0FBSyxDQUFDLGdCQUFnQjtRQUNwQixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUM7SUFDNUIsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxNQUFjO1FBQ3RDLE1BQU0sSUFBSSxHQUFHLCtCQUFzQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlDLElBQUksQ0FBQyxXQUFXLEVBQUU7WUFDaEIsT0FBTyxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLENBQUM7U0FDM0U7UUFFRCxPQUFPLFdBQVcsQ0FBQyxPQUFPLENBQUM7SUFDN0IsQ0FBQztJQUVELEtBQUssQ0FBQyxXQUFXLENBQUMsSUFBaUI7UUFDakMsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUM7ZUFDNUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDcEUsQ0FBQztDQUVGO0FBaEdELG9EQWdHQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cbmltcG9ydCB7IGpzb24gfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZSc7XG5pbXBvcnQgeyBCdWlsZGVySW5mbywgVGFyZ2V0LCB0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0IH0gZnJvbSAnLi4vc3JjL2luZGV4Mic7XG5pbXBvcnQgeyBBcmNoaXRlY3RIb3N0LCBCdWlsZGVyIH0gZnJvbSAnLi4vc3JjL2ludGVybmFsJztcblxuZXhwb3J0IGNsYXNzIFRlc3RpbmdBcmNoaXRlY3RIb3N0IGltcGxlbWVudHMgQXJjaGl0ZWN0SG9zdCB7XG4gIHByaXZhdGUgX2J1aWxkZXJJbXBvcnRNYXAgPSBuZXcgTWFwPHN0cmluZywgQnVpbGRlcj4oKTtcbiAgcHJpdmF0ZSBfYnVpbGRlck1hcCA9IG5ldyBNYXA8c3RyaW5nLCBCdWlsZGVySW5mbz4oKTtcbiAgcHJpdmF0ZSBfdGFyZ2V0TWFwID0gbmV3IE1hcDxzdHJpbmcsIHsgYnVpbGRlck5hbWU6IHN0cmluZywgb3B0aW9uczoganNvbi5Kc29uT2JqZWN0IH0+KCk7XG5cbiAgLyoqXG4gICAqIENhbiBwcm92aWRlIGEgYmFja2VuZCBob3N0LCBpbiBjYXNlIG9mIGludGVncmF0aW9uIHRlc3RzLlxuICAgKiBAcGFyYW0gd29ya3NwYWNlUm9vdCBUaGUgd29ya3NwYWNlIHJvb3QgdG8gdXNlLlxuICAgKiBAcGFyYW0gY3VycmVudERpcmVjdG9yeSBUaGUgY3VycmVudCBkaXJlY3RvcnkgdG8gdXNlLlxuICAgKiBAcGFyYW0gX2JhY2tlbmRIb3N0IEEgaG9zdCB0byBkZWZlciBjYWxscyB0aGF0IGFyZW4ndCByZXNvbHZlZCBoZXJlLlxuICAgKi9cbiAgY29uc3RydWN0b3IoXG4gICAgcHVibGljIHdvcmtzcGFjZVJvb3QgPSAnJyxcbiAgICBwdWJsaWMgY3VycmVudERpcmVjdG9yeSA9IHdvcmtzcGFjZVJvb3QsXG4gICAgcHJpdmF0ZSBfYmFja2VuZEhvc3Q6IEFyY2hpdGVjdEhvc3QgfCBudWxsID0gbnVsbCxcbiAgKSB7fVxuXG4gIGFkZEJ1aWxkZXIoXG4gICAgYnVpbGRlck5hbWU6IHN0cmluZyxcbiAgICBidWlsZGVyOiBCdWlsZGVyLFxuICAgIGRlc2NyaXB0aW9uID0gJ1Rlc3Rpbmcgb25seSBidWlsZGVyLicsXG4gICAgb3B0aW9uU2NoZW1hOiBqc29uLnNjaGVtYS5Kc29uU2NoZW1hID0geyB0eXBlOiAnb2JqZWN0JyB9LFxuICApIHtcbiAgICB0aGlzLl9idWlsZGVySW1wb3J0TWFwLnNldChidWlsZGVyTmFtZSwgYnVpbGRlcik7XG4gICAgdGhpcy5fYnVpbGRlck1hcC5zZXQoYnVpbGRlck5hbWUsIHsgYnVpbGRlck5hbWUsIGRlc2NyaXB0aW9uLCBvcHRpb25TY2hlbWEgfSk7XG4gIH1cbiAgYXN5bmMgYWRkQnVpbGRlckZyb21QYWNrYWdlKHBhY2thZ2VOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwYWNrYWdlSnNvbiA9IGF3YWl0IGltcG9ydChwYWNrYWdlTmFtZSArICcvcGFja2FnZS5qc29uJyk7XG4gICAgaWYgKCEoJ2J1aWxkZXJzJyBpbiBwYWNrYWdlSnNvbikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBwYWNrYWdlLmpzb24sIGJ1aWxkZXJzIGtleSBub3QgZm91bmQuJyk7XG4gICAgfVxuXG4gICAgY29uc3QgYnVpbGRlckpzb25QYXRoID0gcGFja2FnZU5hbWUgKyAnLycgKyBwYWNrYWdlSnNvblsnYnVpbGRlcnMnXTtcbiAgICBjb25zdCBidWlsZGVySnNvbiA9IGF3YWl0IGltcG9ydChidWlsZGVySnNvblBhdGgpO1xuICAgIGNvbnN0IGJ1aWxkZXJzID0gYnVpbGRlckpzb25bJ2J1aWxkZXJzJ107XG4gICAgaWYgKCFidWlsZGVycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGJ1aWxkZXJzLmpzb24sIGJ1aWxkZXJzIGtleSBub3QgZm91bmQuJyk7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBidWlsZGVyTmFtZSBvZiBPYmplY3Qua2V5cyhidWlsZGVycykpIHtcbiAgICAgIGNvbnN0IGIgPSBidWlsZGVyc1tidWlsZGVyTmFtZV07XG4gICAgICAvLyBUT0RPOiByZW1vdmUgdGhpcyBjaGVjayBhcyB2MSBpcyBub3Qgc3VwcG9ydGVkIGFueW1vcmUuXG4gICAgICBpZiAoIWIuaW1wbGVtZW50YXRpb24pIHsgY29udGludWU7IH1cbiAgICAgIGNvbnN0IGhhbmRsZXIgPSBhd2FpdCBpbXBvcnQoYnVpbGRlckpzb25QYXRoICsgJy8uLi8nICsgYi5pbXBsZW1lbnRhdGlvbik7XG4gICAgICBjb25zdCBvcHRpb25zU2NoZW1hID0gYXdhaXQgaW1wb3J0KGJ1aWxkZXJKc29uUGF0aCArICcvLi4vJyArIGIuc2NoZW1hKTtcbiAgICAgIHRoaXMuYWRkQnVpbGRlcihidWlsZGVyTmFtZSwgaGFuZGxlciwgYi5kZXNjcmlwdGlvbiwgb3B0aW9uc1NjaGVtYSk7XG4gICAgfVxuICB9XG4gIGFkZFRhcmdldCh0YXJnZXQ6IFRhcmdldCwgYnVpbGRlck5hbWU6IHN0cmluZywgb3B0aW9uczoganNvbi5Kc29uT2JqZWN0ID0ge30pIHtcbiAgICB0aGlzLl90YXJnZXRNYXAuc2V0KHRhcmdldFN0cmluZ0Zyb21UYXJnZXQodGFyZ2V0KSwgeyBidWlsZGVyTmFtZSwgb3B0aW9ucyB9KTtcbiAgfVxuXG4gIGFzeW5jIGdldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0KHRhcmdldDogVGFyZ2V0KTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgY29uc3QgbmFtZSA9IHRhcmdldFN0cmluZ0Zyb21UYXJnZXQodGFyZ2V0KTtcbiAgICBjb25zdCBtYXliZVRhcmdldCA9IHRoaXMuX3RhcmdldE1hcC5nZXQobmFtZSk7XG4gICAgaWYgKCFtYXliZVRhcmdldCkge1xuICAgICAgcmV0dXJuIHRoaXMuX2JhY2tlbmRIb3N0ICYmIHRoaXMuX2JhY2tlbmRIb3N0LmdldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0KHRhcmdldCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG1heWJlVGFyZ2V0LmJ1aWxkZXJOYW1lO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlc29sdmUgYSBidWlsZGVyLiBUaGlzIG5lZWRzIHRvIHJldHVybiBhIHN0cmluZyB3aGljaCB3aWxsIGJlIHVzZWQgaW4gYSBkeW5hbWljIGBpbXBvcnQoKWBcbiAgICogY2xhdXNlLiBUaGlzIHNob3VsZCB0aHJvdyBpZiBubyBidWlsZGVyIGNhbiBiZSBmb3VuZC4gVGhlIGR5bmFtaWMgaW1wb3J0IHdpbGwgdGhyb3cgaWZcbiAgICogaXQgaXMgdW5zdXBwb3J0ZWQuXG4gICAqIEBwYXJhbSBidWlsZGVyTmFtZSBUaGUgbmFtZSBvZiB0aGUgYnVpbGRlciB0byBiZSB1c2VkLlxuICAgKiBAcmV0dXJucyBBbGwgdGhlIGluZm8gbmVlZGVkIGZvciB0aGUgYnVpbGRlciBpdHNlbGYuXG4gICAqL1xuICBhc3luYyByZXNvbHZlQnVpbGRlcihidWlsZGVyTmFtZTogc3RyaW5nKTogUHJvbWlzZTxCdWlsZGVySW5mbyB8IG51bGw+IHtcbiAgICByZXR1cm4gdGhpcy5fYnVpbGRlck1hcC5nZXQoYnVpbGRlck5hbWUpXG4gICAgICAgIHx8ICh0aGlzLl9iYWNrZW5kSG9zdCAmJiB0aGlzLl9iYWNrZW5kSG9zdC5yZXNvbHZlQnVpbGRlcihidWlsZGVyTmFtZSkpO1xuICB9XG5cbiAgYXN5bmMgZ2V0Q3VycmVudERpcmVjdG9yeSgpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIHJldHVybiB0aGlzLmN1cnJlbnREaXJlY3Rvcnk7XG4gIH1cbiAgYXN5bmMgZ2V0V29ya3NwYWNlUm9vdCgpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIHJldHVybiB0aGlzLndvcmtzcGFjZVJvb3Q7XG4gIH1cblxuICBhc3luYyBnZXRPcHRpb25zRm9yVGFyZ2V0KHRhcmdldDogVGFyZ2V0KTogUHJvbWlzZTxqc29uLkpzb25PYmplY3QgfCBudWxsPiB7XG4gICAgY29uc3QgbmFtZSA9IHRhcmdldFN0cmluZ0Zyb21UYXJnZXQodGFyZ2V0KTtcbiAgICBjb25zdCBtYXliZVRhcmdldCA9IHRoaXMuX3RhcmdldE1hcC5nZXQobmFtZSk7XG4gICAgaWYgKCFtYXliZVRhcmdldCkge1xuICAgICAgcmV0dXJuIHRoaXMuX2JhY2tlbmRIb3N0ICYmIHRoaXMuX2JhY2tlbmRIb3N0LmdldE9wdGlvbnNGb3JUYXJnZXQodGFyZ2V0KTtcbiAgICB9XG5cbiAgICByZXR1cm4gbWF5YmVUYXJnZXQub3B0aW9ucztcbiAgfVxuXG4gIGFzeW5jIGxvYWRCdWlsZGVyKGluZm86IEJ1aWxkZXJJbmZvKTogUHJvbWlzZTxCdWlsZGVyIHwgbnVsbD4ge1xuICAgIHJldHVybiB0aGlzLl9idWlsZGVySW1wb3J0TWFwLmdldChpbmZvLmJ1aWxkZXJOYW1lKVxuICAgICAgICB8fCAodGhpcy5fYmFja2VuZEhvc3QgJiYgdGhpcy5fYmFja2VuZEhvc3QubG9hZEJ1aWxkZXIoaW5mbykpO1xuICB9XG5cbn1cbiJdfQ==