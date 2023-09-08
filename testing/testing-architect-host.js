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
exports.TestingArchitectHost = void 0;
const src_1 = require("../src");
class TestingArchitectHost {
    workspaceRoot;
    currentDirectory;
    _backendHost;
    _builderImportMap = new Map();
    _builderMap = new Map();
    _targetMap = new Map();
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
    }
    addBuilder(builderName, builder, description = 'Testing only builder.', optionSchema = { type: 'object' }) {
        this._builderImportMap.set(builderName, builder);
        this._builderMap.set(builderName, { builderName, description, optionSchema });
    }
    async addBuilderFromPackage(packageName) {
        const packageJson = await Promise.resolve(`${packageName + '/package.json'}`).then(s => __importStar(require(s)));
        if (!('builders' in packageJson)) {
            throw new Error('Invalid package.json, builders key not found.');
        }
        if (!packageJson.name) {
            throw new Error('Invalid package name');
        }
        const builderJsonPath = packageName + '/' + packageJson['builders'];
        const builderJson = await Promise.resolve(`${builderJsonPath}`).then(s => __importStar(require(s)));
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
            const handler = (await Promise.resolve(`${builderJsonPath + '/../' + b.implementation}`).then(s => __importStar(require(s)))).default;
            const optionsSchema = await Promise.resolve(`${builderJsonPath + '/../' + b.schema}`).then(s => __importStar(require(s)));
            this.addBuilder(`${packageJson.name}:${builderName}`, handler, b.description, optionsSchema);
        }
    }
    addTarget(target, builderName, options = {}) {
        this._targetMap.set((0, src_1.targetStringFromTarget)(target), { builderName, options });
    }
    async getBuilderNameForTarget(target) {
        const name = (0, src_1.targetStringFromTarget)(target);
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
        return (this._builderMap.get(builderName) ||
            (this._backendHost && this._backendHost.resolveBuilder(builderName)));
    }
    async getCurrentDirectory() {
        return this.currentDirectory;
    }
    async getWorkspaceRoot() {
        return this.workspaceRoot;
    }
    async getOptionsForTarget(target) {
        const name = (0, src_1.targetStringFromTarget)(target);
        const maybeTarget = this._targetMap.get(name);
        if (!maybeTarget) {
            return this._backendHost && this._backendHost.getOptionsForTarget(target);
        }
        return maybeTarget.options;
    }
    async getProjectMetadata(target) {
        return this._backendHost && this._backendHost.getProjectMetadata(target);
    }
    async loadBuilder(info) {
        return (this._builderImportMap.get(info.builderName) ||
            (this._backendHost && this._backendHost.loadBuilder(info)));
    }
}
exports.TestingArchitectHost = TestingArchitectHost;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZy1hcmNoaXRlY3QtaG9zdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2FyY2hpdGVjdC90ZXN0aW5nL3Rlc3RpbmctYXJjaGl0ZWN0LWhvc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFHSCxnQ0FBcUU7QUFHckUsTUFBYSxvQkFBb0I7SUFZdEI7SUFDQTtJQUNDO0lBYkYsaUJBQWlCLEdBQUcsSUFBSSxHQUFHLEVBQW1CLENBQUM7SUFDL0MsV0FBVyxHQUFHLElBQUksR0FBRyxFQUF1QixDQUFDO0lBQzdDLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBNkQsQ0FBQztJQUUxRjs7Ozs7T0FLRztJQUNILFlBQ1MsZ0JBQWdCLEVBQUUsRUFDbEIsbUJBQW1CLGFBQWEsRUFDL0IsZUFBcUMsSUFBSTtRQUYxQyxrQkFBYSxHQUFiLGFBQWEsQ0FBSztRQUNsQixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQWdCO1FBQy9CLGlCQUFZLEdBQVosWUFBWSxDQUE2QjtJQUNoRCxDQUFDO0lBRUosVUFBVSxDQUNSLFdBQW1CLEVBQ25CLE9BQWdCLEVBQ2hCLFdBQVcsR0FBRyx1QkFBdUIsRUFDckMsZUFBdUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO1FBRXpELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ2pELElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBQ0QsS0FBSyxDQUFDLHFCQUFxQixDQUFDLFdBQW1CO1FBQzdDLE1BQU0sV0FBVyxHQUFHLHlCQUFhLFdBQVcsR0FBRyxlQUFlLHVDQUFDLENB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QyxJQUFJLENBQUMsQ0FBQztRQUM5QyxJQUFJLENBQUMsV0FBVyxFQUFFO1lBQ2hCLE9BQU8sSUFBSSxDQUFDLFlBQVksSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQzNFO1FBRUQsT0FBTyxXQUFXLENBQUMsT0FBTyxDQUFDO0lBQzdCLENBQUM7SUFFRCxLQUFLLENBQUMsa0JBQWtCLENBQUMsTUFBdUI7UUFDOUMsT0FBTyxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsa0JBQWtCLENBQUMsTUFBZ0IsQ0FBQyxDQUFDO0lBQ3JGLENBQUM7SUFFRCxLQUFLLENBQUMsV0FBVyxDQUFDLElBQWlCO1FBQ2pDLE9BQU8sQ0FDTCxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUM7WUFDNUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQzNELENBQUM7SUFDSixDQUFDO0NBQ0Y7QUE3R0Qsb0RBNkdDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7IGpzb24gfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZSc7XG5pbXBvcnQgeyBCdWlsZGVySW5mbywgVGFyZ2V0LCB0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0IH0gZnJvbSAnLi4vc3JjJztcbmltcG9ydCB7IEFyY2hpdGVjdEhvc3QsIEJ1aWxkZXIgfSBmcm9tICcuLi9zcmMvaW50ZXJuYWwnO1xuXG5leHBvcnQgY2xhc3MgVGVzdGluZ0FyY2hpdGVjdEhvc3QgaW1wbGVtZW50cyBBcmNoaXRlY3RIb3N0IHtcbiAgcHJpdmF0ZSBfYnVpbGRlckltcG9ydE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBCdWlsZGVyPigpO1xuICBwcml2YXRlIF9idWlsZGVyTWFwID0gbmV3IE1hcDxzdHJpbmcsIEJ1aWxkZXJJbmZvPigpO1xuICBwcml2YXRlIF90YXJnZXRNYXAgPSBuZXcgTWFwPHN0cmluZywgeyBidWlsZGVyTmFtZTogc3RyaW5nOyBvcHRpb25zOiBqc29uLkpzb25PYmplY3QgfT4oKTtcblxuICAvKipcbiAgICogQ2FuIHByb3ZpZGUgYSBiYWNrZW5kIGhvc3QsIGluIGNhc2Ugb2YgaW50ZWdyYXRpb24gdGVzdHMuXG4gICAqIEBwYXJhbSB3b3Jrc3BhY2VSb290IFRoZSB3b3Jrc3BhY2Ugcm9vdCB0byB1c2UuXG4gICAqIEBwYXJhbSBjdXJyZW50RGlyZWN0b3J5IFRoZSBjdXJyZW50IGRpcmVjdG9yeSB0byB1c2UuXG4gICAqIEBwYXJhbSBfYmFja2VuZEhvc3QgQSBob3N0IHRvIGRlZmVyIGNhbGxzIHRoYXQgYXJlbid0IHJlc29sdmVkIGhlcmUuXG4gICAqL1xuICBjb25zdHJ1Y3RvcihcbiAgICBwdWJsaWMgd29ya3NwYWNlUm9vdCA9ICcnLFxuICAgIHB1YmxpYyBjdXJyZW50RGlyZWN0b3J5ID0gd29ya3NwYWNlUm9vdCxcbiAgICBwcml2YXRlIF9iYWNrZW5kSG9zdDogQXJjaGl0ZWN0SG9zdCB8IG51bGwgPSBudWxsLFxuICApIHt9XG5cbiAgYWRkQnVpbGRlcihcbiAgICBidWlsZGVyTmFtZTogc3RyaW5nLFxuICAgIGJ1aWxkZXI6IEJ1aWxkZXIsXG4gICAgZGVzY3JpcHRpb24gPSAnVGVzdGluZyBvbmx5IGJ1aWxkZXIuJyxcbiAgICBvcHRpb25TY2hlbWE6IGpzb24uc2NoZW1hLkpzb25TY2hlbWEgPSB7IHR5cGU6ICdvYmplY3QnIH0sXG4gICkge1xuICAgIHRoaXMuX2J1aWxkZXJJbXBvcnRNYXAuc2V0KGJ1aWxkZXJOYW1lLCBidWlsZGVyKTtcbiAgICB0aGlzLl9idWlsZGVyTWFwLnNldChidWlsZGVyTmFtZSwgeyBidWlsZGVyTmFtZSwgZGVzY3JpcHRpb24sIG9wdGlvblNjaGVtYSB9KTtcbiAgfVxuICBhc3luYyBhZGRCdWlsZGVyRnJvbVBhY2thZ2UocGFja2FnZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHBhY2thZ2VKc29uID0gYXdhaXQgaW1wb3J0KHBhY2thZ2VOYW1lICsgJy9wYWNrYWdlLmpzb24nKTtcbiAgICBpZiAoISgnYnVpbGRlcnMnIGluIHBhY2thZ2VKc29uKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHBhY2thZ2UuanNvbiwgYnVpbGRlcnMga2V5IG5vdCBmb3VuZC4nKTtcbiAgICB9XG5cbiAgICBpZiAoIXBhY2thZ2VKc29uLm5hbWUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBwYWNrYWdlIG5hbWUnKTtcbiAgICB9XG5cbiAgICBjb25zdCBidWlsZGVySnNvblBhdGggPSBwYWNrYWdlTmFtZSArICcvJyArIHBhY2thZ2VKc29uWydidWlsZGVycyddO1xuICAgIGNvbnN0IGJ1aWxkZXJKc29uID0gYXdhaXQgaW1wb3J0KGJ1aWxkZXJKc29uUGF0aCk7XG4gICAgY29uc3QgYnVpbGRlcnMgPSBidWlsZGVySnNvblsnYnVpbGRlcnMnXTtcbiAgICBpZiAoIWJ1aWxkZXJzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYnVpbGRlcnMuanNvbiwgYnVpbGRlcnMga2V5IG5vdCBmb3VuZC4nKTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGJ1aWxkZXJOYW1lIG9mIE9iamVjdC5rZXlzKGJ1aWxkZXJzKSkge1xuICAgICAgY29uc3QgYiA9IGJ1aWxkZXJzW2J1aWxkZXJOYW1lXTtcbiAgICAgIC8vIFRPRE86IHJlbW92ZSB0aGlzIGNoZWNrIGFzIHYxIGlzIG5vdCBzdXBwb3J0ZWQgYW55bW9yZS5cbiAgICAgIGlmICghYi5pbXBsZW1lbnRhdGlvbikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGhhbmRsZXIgPSAoYXdhaXQgaW1wb3J0KGJ1aWxkZXJKc29uUGF0aCArICcvLi4vJyArIGIuaW1wbGVtZW50YXRpb24pKS5kZWZhdWx0O1xuICAgICAgY29uc3Qgb3B0aW9uc1NjaGVtYSA9IGF3YWl0IGltcG9ydChidWlsZGVySnNvblBhdGggKyAnLy4uLycgKyBiLnNjaGVtYSk7XG4gICAgICB0aGlzLmFkZEJ1aWxkZXIoYCR7cGFja2FnZUpzb24ubmFtZX06JHtidWlsZGVyTmFtZX1gLCBoYW5kbGVyLCBiLmRlc2NyaXB0aW9uLCBvcHRpb25zU2NoZW1hKTtcbiAgICB9XG4gIH1cbiAgYWRkVGFyZ2V0KHRhcmdldDogVGFyZ2V0LCBidWlsZGVyTmFtZTogc3RyaW5nLCBvcHRpb25zOiBqc29uLkpzb25PYmplY3QgPSB7fSkge1xuICAgIHRoaXMuX3RhcmdldE1hcC5zZXQodGFyZ2V0U3RyaW5nRnJvbVRhcmdldCh0YXJnZXQpLCB7IGJ1aWxkZXJOYW1lLCBvcHRpb25zIH0pO1xuICB9XG5cbiAgYXN5bmMgZ2V0QnVpbGRlck5hbWVGb3JUYXJnZXQodGFyZ2V0OiBUYXJnZXQpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgICBjb25zdCBuYW1lID0gdGFyZ2V0U3RyaW5nRnJvbVRhcmdldCh0YXJnZXQpO1xuICAgIGNvbnN0IG1heWJlVGFyZ2V0ID0gdGhpcy5fdGFyZ2V0TWFwLmdldChuYW1lKTtcbiAgICBpZiAoIW1heWJlVGFyZ2V0KSB7XG4gICAgICByZXR1cm4gdGhpcy5fYmFja2VuZEhvc3QgJiYgdGhpcy5fYmFja2VuZEhvc3QuZ2V0QnVpbGRlck5hbWVGb3JUYXJnZXQodGFyZ2V0KTtcbiAgICB9XG5cbiAgICByZXR1cm4gbWF5YmVUYXJnZXQuYnVpbGRlck5hbWU7XG4gIH1cblxuICAvKipcbiAgICogUmVzb2x2ZSBhIGJ1aWxkZXIuIFRoaXMgbmVlZHMgdG8gcmV0dXJuIGEgc3RyaW5nIHdoaWNoIHdpbGwgYmUgdXNlZCBpbiBhIGR5bmFtaWMgYGltcG9ydCgpYFxuICAgKiBjbGF1c2UuIFRoaXMgc2hvdWxkIHRocm93IGlmIG5vIGJ1aWxkZXIgY2FuIGJlIGZvdW5kLiBUaGUgZHluYW1pYyBpbXBvcnQgd2lsbCB0aHJvdyBpZlxuICAgKiBpdCBpcyB1bnN1cHBvcnRlZC5cbiAgICogQHBhcmFtIGJ1aWxkZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSBidWlsZGVyIHRvIGJlIHVzZWQuXG4gICAqIEByZXR1cm5zIEFsbCB0aGUgaW5mbyBuZWVkZWQgZm9yIHRoZSBidWlsZGVyIGl0c2VsZi5cbiAgICovXG4gIGFzeW5jIHJlc29sdmVCdWlsZGVyKGJ1aWxkZXJOYW1lOiBzdHJpbmcpOiBQcm9taXNlPEJ1aWxkZXJJbmZvIHwgbnVsbD4ge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLl9idWlsZGVyTWFwLmdldChidWlsZGVyTmFtZSkgfHxcbiAgICAgICh0aGlzLl9iYWNrZW5kSG9zdCAmJiB0aGlzLl9iYWNrZW5kSG9zdC5yZXNvbHZlQnVpbGRlcihidWlsZGVyTmFtZSkpXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIGdldEN1cnJlbnREaXJlY3RvcnkoKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICByZXR1cm4gdGhpcy5jdXJyZW50RGlyZWN0b3J5O1xuICB9XG4gIGFzeW5jIGdldFdvcmtzcGFjZVJvb3QoKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICByZXR1cm4gdGhpcy53b3Jrc3BhY2VSb290O1xuICB9XG5cbiAgYXN5bmMgZ2V0T3B0aW9uc0ZvclRhcmdldCh0YXJnZXQ6IFRhcmdldCk6IFByb21pc2U8anNvbi5Kc29uT2JqZWN0IHwgbnVsbD4ge1xuICAgIGNvbnN0IG5hbWUgPSB0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0KHRhcmdldCk7XG4gICAgY29uc3QgbWF5YmVUYXJnZXQgPSB0aGlzLl90YXJnZXRNYXAuZ2V0KG5hbWUpO1xuICAgIGlmICghbWF5YmVUYXJnZXQpIHtcbiAgICAgIHJldHVybiB0aGlzLl9iYWNrZW5kSG9zdCAmJiB0aGlzLl9iYWNrZW5kSG9zdC5nZXRPcHRpb25zRm9yVGFyZ2V0KHRhcmdldCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG1heWJlVGFyZ2V0Lm9wdGlvbnM7XG4gIH1cblxuICBhc3luYyBnZXRQcm9qZWN0TWV0YWRhdGEodGFyZ2V0OiBUYXJnZXQgfCBzdHJpbmcpOiBQcm9taXNlPGpzb24uSnNvbk9iamVjdCB8IG51bGw+IHtcbiAgICByZXR1cm4gdGhpcy5fYmFja2VuZEhvc3QgJiYgdGhpcy5fYmFja2VuZEhvc3QuZ2V0UHJvamVjdE1ldGFkYXRhKHRhcmdldCBhcyBzdHJpbmcpO1xuICB9XG5cbiAgYXN5bmMgbG9hZEJ1aWxkZXIoaW5mbzogQnVpbGRlckluZm8pOiBQcm9taXNlPEJ1aWxkZXIgfCBudWxsPiB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuX2J1aWxkZXJJbXBvcnRNYXAuZ2V0KGluZm8uYnVpbGRlck5hbWUpIHx8XG4gICAgICAodGhpcy5fYmFja2VuZEhvc3QgJiYgdGhpcy5fYmFja2VuZEhvc3QubG9hZEJ1aWxkZXIoaW5mbykpXG4gICAgKTtcbiAgfVxufVxuIl19