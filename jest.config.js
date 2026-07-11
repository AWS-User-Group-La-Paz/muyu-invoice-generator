module.exports = {
	testEnvironment: "node",
	collectCoverage: true,
	coverageDirectory: "coverage",
	coverageReporters: ["text", "lcov", "clover"],
	collectCoverageFrom: ["src/**/*.js"],
	coverageThreshold: {
		global: {
			statements: 80,
			branches: 80,
			functions: 80,
			lines: 80,
		},
	},
};
