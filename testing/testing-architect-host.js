"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const src_1 = require("../src");
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
        // f1 const is a temporary workaround for a TS bug with UMDs.
        // See microsoft/TypeScript#36780. Should be removed when
        // https://github.com/bazelbuild/rules_typescript/pull/492 goes in.
        const f1 = packageName + '/package.json';
        const packageJson = await Promise.resolve().then(() => require(f1));
        if (!('builders' in packageJson)) {
            throw new Error('Invalid package.json, builders key not found.');
        }
        if (!packageJson.name) {
            throw new Error('Invalid package name');
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
            // f2 and f3 consts are a temporary workaround for a TS bug with UMDs.
            // See microsoft/TypeScript#36780. Should be removed when
            // https://github.com/bazelbuild/rules_typescript/pull/492 goes in.
            const f2 = builderJsonPath + '/../' + b.implementation;
            const handler = (await Promise.resolve().then(() => require(f2))).default;
            const f3 = builderJsonPath + '/../' + b.schema;
            const optionsSchema = await Promise.resolve().then(() => require(f3));
            this.addBuilder(`${packageJson.name}:${builderName}`, handler, b.description, optionsSchema);
        }
    }
    addTarget(target, builderName, options = {}) {
        this._targetMap.set(src_1.targetStringFromTarget(target), { builderName, options });
    }
    async getBuilderNameForTarget(target) {
        const name = src_1.targetStringFromTarget(target);
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
        const name = src_1.targetStringFromTarget(target);
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
        return this._builderImportMap.get(info.builderName)
            || (this._backendHost && this._backendHost.loadBuilder(info));
    }
}
exports.TestingArchitectHost = TestingArchitectHost;
