# Static Code Review

**Review: 0 critical, 77 warnings, 1 info across 61 files.**

## WARNING (77)

- **bench-awsl\src\index.ts:6** [no-console-log] console.log in production code
- **bench-awsl-complex\src\middleware\requestLogger.ts:8** [no-console-log] console.log in production code
- **bench-awsl-complex\src\routes\auth.ts:15** [no-any] Explicit `any` type used
- **bench-awsl-complex\src\server.ts:6** [no-console-log] console.log in production code
- **bench-native\src\index.ts:6** [no-console-log] console.log in production code
- **bench-native-complex\src\index.ts:6** [no-console-log] console.log in production code
- **bench-native-complex\src\middleware\logger.ts:8** [no-console-log] console.log in production code
- **bench-native-complex\src\routes\auth.ts:42** [no-any] Explicit `any` type used
- **bench-native-complex\src\routes\auth.ts:73** [no-any] Explicit `any` type used
- **bench-native-complex\src\routes\todos.ts:48** [no-any] Explicit `any` type used
- **bench-native-complex\src\routes\todos.ts:76** [no-any] Explicit `any` type used
- **bench-native-complex\src\routes\todos.ts:112** [no-any] Explicit `any` type used
- **src\cli.ts:100** [no-console-log] console.log in production code
- **src\cli.ts:102** [no-console-log] console.log in production code
- **src\cli.ts:103** [no-console-log] console.log in production code
- **src\cli.ts:104** [no-console-log] console.log in production code
- **src\cli.ts:105** [no-console-log] console.log in production code
- **src\cli.ts:106** [no-console-log] console.log in production code
- **src\cli.ts:107** [no-console-log] console.log in production code
- **src\cli.ts:117** [no-console-log] console.log in production code
- **src\cli.ts:119** [no-console-log] console.log in production code
- **src\cli.ts:129** [no-console-log] console.log in production code
- **src\cli.ts:133** [no-console-log] console.log in production code
- **src\cli.ts:161** [no-console-log] console.log in production code
- **src\cli.ts:163** [no-console-log] console.log in production code
- **src\cli.ts:165** [no-console-log] console.log in production code
- **src\cli.ts:168** [no-console-log] console.log in production code
- **src\cli.ts:169** [no-console-log] console.log in production code
- **src\cli.ts:172** [no-console-log] console.log in production code
- **src\cli.ts:174** [no-console-log] console.log in production code
- **src\cli.ts:176** [no-console-log] console.log in production code
- **src\cli.ts:177** [no-console-log] console.log in production code
- **src\cli.ts:185** [no-console-log] console.log in production code
- **src\cli.ts:206** [no-console-log] console.log in production code
- **src\cli.ts:207** [no-console-log] console.log in production code
- **src\cli.ts:209** [no-console-log] console.log in production code
- **src\cli.ts:211** [no-console-log] console.log in production code
- **src\cli.ts:214** [no-console-log] console.log in production code
- **src\cli.ts:216** [no-console-log] console.log in production code
- **src\cli.ts:217** [no-console-log] console.log in production code
- **src\cli.ts:223** [no-console-log] console.log in production code
- **src\cli.ts:234** [no-console-log] console.log in production code
- **src\cli.ts:235** [no-console-log] console.log in production code
- **src\cli.ts:236** [no-console-log] console.log in production code
- **src\cli.ts:238** [no-console-log] console.log in production code
- **src\cli.ts:239** [no-console-log] console.log in production code
- **src\cli.ts:244** [no-console-log] console.log in production code
- **src\cli.ts:366** [no-console-log] console.log in production code
- **src\cli.ts:367** [no-console-log] console.log in production code
- **src\cli.ts:378** [no-any] Explicit `any` type used
- **src\cli.ts:379** [no-console-log] console.log in production code
- **src\cli.ts:380** [no-console-log] console.log in production code
- **src\cli.ts:381** [no-console-log] console.log in production code
- **src\cli.ts:385** [no-console-log] console.log in production code
- **src\cli.ts:390** [no-console-log] console.log in production code
- **src\cli.ts:393** [no-console-log] console.log in production code
- **src\cli.ts:399** [no-console-log] console.log in production code
- **src\cli.ts:400** [no-console-log] console.log in production code
- **src\install.ts:344** [no-console-log] console.log in production code
- **src\install.ts:359** [no-console-log] console.log in production code
- **src\install.ts:375** [no-console-log] console.log in production code
- **src\install.ts:378** [no-console-log] console.log in production code
- **src\lock.ts:85** [no-any] Explicit `any` type used
- **src\lock.ts:163** [no-any] Explicit `any` type used
- **src\orchestrator.ts:135** [no-empty-catch] Empty catch block — errors silently swallowed
- **src\orchestrator.ts:1** [file-too-long] File has 827 lines, consider splitting
- **src\planning.ts:122** [no-any] Explicit `any` type used
- **src\runner.ts:249** [no-any] Explicit `any` type used
- **src\runner.ts:267** [no-any] Explicit `any` type used
- **src\runner.ts:269** [no-any] Explicit `any` type used
- **src\tools.ts:40** [no-any] Explicit `any` type used
- **src\tools.ts:62** [no-any] Explicit `any` type used
- **src\tools.ts:89** [no-any] Explicit `any` type used
- **src\tools.ts:114** [no-any] Explicit `any` type used
- **src\validate.ts:101** [no-any] Explicit `any` type used
- **src\verify.ts:74** [no-any] Explicit `any` type used
- **src\verify.ts:101** [no-empty-catch] Empty catch block — errors silently swallowed

## INFO (1)

- **bench-native-complex\src\store.ts:24** [todo-comment] // Todo methods
