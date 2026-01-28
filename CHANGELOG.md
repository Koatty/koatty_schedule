# Changelog

## 3.3.7

### Patch Changes

- build
- Updated dependencies
  - koatty_container@1.17.4
  - koatty_core@2.0.14
  - koatty_lib@1.4.5
  - koatty_logger@2.3.4
  - koatty_store@1.9.4

## 3.3.6

### Patch Changes

- build
- Updated dependencies
  - koatty_container@1.17.3
  - koatty_core@2.0.13
  - koatty_lib@1.4.4
  - koatty_logger@2.3.3
  - koatty_store@1.9.3

## 3.3.5

### Patch Changes

- build
- Updated dependencies
  - koatty_container@1.17.2
  - koatty_lib@1.4.3
  - koatty_logger@2.3.2
  - koatty_store@1.9.2
  - koatty_core@2.0.12

## 3.3.4

### Patch Changes

- Updated dependencies
  - koatty_lib@1.4.2
  - koatty_container@1.17.1
  - koatty_core@2.0.11
  - koatty_logger@2.3.1
  - koatty_store@1.9.1

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [3.3.3](https://github.com/thinkkoa/koatty_schedule/compare/v3.3.2...v3.3.3) (2025-10-31)

### [3.3.2](https://github.com/thinkkoa/koatty_schedule/compare/v3.3.1...v3.3.2) (2025-06-22)

### [3.3.1](https://github.com/thinkkoa/koatty_schedule/compare/v3.3.0...v3.3.1) (2025-06-22)

### Bug Fixes

- unify component type constant to 'COMPONENT' string literal in IOCContainer registration ([7098c7e](https://github.com/thinkkoa/koatty_schedule/commit/7098c7e2c326a6461b6b8b5c84d07a3ced75de5f))

## [3.3.0](https://github.com/thinkkoa/koatty_schedule/compare/v3.2.0...v3.3.0) (2025-06-22)

### Features

- enhance distributed locking and scheduling system with global configuration management and improved validation ([79a10f5](https://github.com/thinkkoa/koatty_schedule/commit/79a10f5a1ac66958aa44d3ea9151a65826748724))
- improve RedLock singleton management with thread-safe initialization and lock renewal enhancements ([ec426aa](https://github.com/thinkkoa/koatty_schedule/commit/ec426aae3cd0d824661b1b94ae8043bf66ace606))
- introduce component-specific metadata keys for scheduled and redlock decorators ([173e79a](https://github.com/thinkkoa/koatty_schedule/commit/173e79ac916c13b20c93d2efac7e69009cc5cf32))
- refactor RedLock configuration and remove deprecated ScheduleConfig ([7bd4667](https://github.com/thinkkoa/koatty_schedule/commit/7bd4667242c6fd07cfd58a4322d93f4c4548100a))
- update decorator types to support symbol property keys and improve IOC container integration ([f7b6382](https://github.com/thinkkoa/koatty_schedule/commit/f7b6382e855914176c130b10a769b03cc74c0f23))
- use dynamic componentType instead of hardcoded constants for IOCContainer registration ([42ca073](https://github.com/thinkkoa/koatty_schedule/commit/42ca07353a8082b1af9e49d43914497d41cddd27))

### Bug Fixes

- 修复 IOC 容器元数据键格式不匹配问题 ([644714f](https://github.com/thinkkoa/koatty_schedule/commit/644714f20497196fb705e551880a9ef527257cb7))

### [2.1.1](https://github.com/thinkkoa/koatty_schedule/compare/v2.1.0...v2.1.1) (2025-06-09)

### [1.6.2](https://github.com/thinkkoa/koatty_schedule/compare/v2.0.1...v1.6.2) (2024-11-07)

## [3.2.0](https://github.com/thinkkoa/koatty_schedule/compare/v3.1.0...v3.2.0) (2025-06-22)

### Features

- introduce component-specific metadata keys for scheduled and redlock decorators ([803b350](https://github.com/thinkkoa/koatty_schedule/commit/803b3503489c02ab138b3f9f14cb520dd6c7fec4))

### Bug Fixes

- 修复 IOC 容器元数据键格式不匹配问题 ([065d456](https://github.com/thinkkoa/koatty_schedule/commit/065d456fc65004e25eb19838da96bf0a52cb2af1))

## [3.1.0](https://github.com/thinkkoa/koatty_schedule/compare/v3.0.0...v3.1.0) (2025-06-21)

### Features

- update decorator types to support symbol property keys and improve IOC container integration ([a60ef3e](https://github.com/thinkkoa/koatty_schedule/commit/a60ef3e361b245f97ba0d6ee51d42efd437a1252))

## [3.0.0](https://github.com/thinkkoa/koatty_schedule/compare/v2.1.0...v3.0.0) (2025-06-21)

### Features

- enhance distributed locking and scheduling system with global configuration management and improved validation ([cf3924c](https://github.com/thinkkoa/koatty_schedule/commit/cf3924cf6bccf951f070c68e33483ae935828382))
- improve RedLock singleton management with thread-safe initialization and lock renewal enhancements ([4e381cd](https://github.com/thinkkoa/koatty_schedule/commit/4e381cd8eec6aa366a6db813918f213f07b02921))
- refactor RedLock configuration and remove deprecated ScheduleConfig ([bb10ac7](https://github.com/thinkkoa/koatty_schedule/commit/bb10ac7dab67d32ca75a43db92c587a662bc1b9f))

## [2.1.0](https://github.com/thinkkoa/koatty_schedule/compare/v2.0.1...v2.1.0) (2025-06-09)

### Features

- add schedule and redlock decorators with config management ([c1b5359](https://github.com/thinkkoa/koatty_schedule/commit/c1b535940df2b8a3403bf024137519246945870e))
- enhance ConfigManager with singleton pattern, environment config loading ([00db6eb](https://github.com/thinkkoa/koatty_schedule/commit/00db6eb97bdae226aaf433b23c770704b33d05e8))
- introduce DecoratorType enum, refactor decorator management system, ([e58e718](https://github.com/thinkkoa/koatty_schedule/commit/e58e718975e663820778352bedb6421e6852ba9f))

### Bug Fixes

- simplify error handling in ConfigManager and RedLocker ([7be75fc](https://github.com/thinkkoa/koatty_schedule/commit/7be75fc7f4160094b57ca64905df4c81f77adb51))

### Refactor

- use MethodDecoratorManager ([ff077c7](https://github.com/thinkkoa/koatty_schedule/commit/ff077c7211bb6cf258c6885e1d7dcbdacde90ef1))

### [2.0.1](https://github.com/thinkkoa/koatty_schedule/compare/v2.0.0...v2.0.1) (2024-01-17)

## [2.0.0](https://github.com/thinkkoa/koatty_schedule/compare/v1.6.0...v2.0.0) (2024-01-17)

### Refactor

- redlock ([beb7cd9](https://github.com/thinkkoa/koatty_schedule/commit/beb7cd90878319cb1c480f4ad11b2632c184872b))
- redlock ([ea29337](https://github.com/thinkkoa/koatty_schedule/commit/ea29337052aee081322918914876a95923d314ae))

## [1.6.0](https://github.com/thinkkoa/koatty_schedule/compare/v1.5.11...v1.6.0) (2023-12-20)

### [1.5.11](https://github.com/thinkkoa/koatty_schedule/compare/v1.5.10...v1.5.11) (2023-07-28)

### [1.5.10](https://github.com/thinkkoa/koatty_schedule/compare/v1.5.8...v1.5.10) (2023-01-13)

### [1.5.8](https://github.com/thinkkoa/koatty_schedule/compare/v1.5.7...v1.5.8) (2022-11-03)

### [1.5.7](https://github.com/thinkkoa/koatty_schedule/compare/v1.5.6...v1.5.7) (2022-09-05)

### Bug Fixes

- update ([8eb40be](https://github.com/thinkkoa/koatty_schedule/commit/8eb40be4f0778d218a2a8b9a9370ffbe26c9e884))
- upgrade deps ([51a68af](https://github.com/thinkkoa/koatty_schedule/commit/51a68af12437a08e3a5468b27b57ae597f66695d))

### [1.5.6](https://github.com/thinkkoa/koatty_schedule/compare/v1.5.5...v1.5.6) (2022-05-27)

### [1.5.5](https://github.com/thinkkoa/koatty_schedule/compare/v1.5.4...v1.5.5) (2022-03-02)

### [1.5.4](https://github.com/thinkkoa/koatty_schedule/compare/v1.5.2...v1.5.4) (2021-12-09)

### [1.5.2](https://github.com/thinkkoa/koatty_schedule/compare/v1.4.10...v1.5.2) (2021-12-02)

### [1.4.10](https://github.com/thinkkoa/koatty_schedule/compare/v1.4.8...v1.4.10) (2021-11-23)

### [1.4.8](https://github.com/thinkkoa/koatty_schedule/compare/v1.4.6...v1.4.8) (2021-11-20)
