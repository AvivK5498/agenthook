// Package version, read from package.json at runtime. dist/*.js sits one level
// under the package root (rootDir src → outDir dist), so ../package.json
// resolves both from the installed npm package and from the repo's built dist.
// require() (CommonJS build) reads it synchronously with no bundler step.
export const VERSION: string = require("../package.json").version as string;
