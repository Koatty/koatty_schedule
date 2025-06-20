<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [koatty\_schedule](./koatty_schedule.md) &gt; [Scheduled](./koatty_schedule.scheduled.md)

## Scheduled() function

Schedule task decorator with optimized preprocessing


**Signature:**

```typescript
export declare function Scheduled(cron: string, timezone?: string): MethodDecorator;
```

## Parameters

<table><thead><tr><th>

Parameter


</th><th>

Type


</th><th>

Description


</th></tr></thead>
<tbody><tr><td>

cron


</td><td>

string


</td><td>

Cron expression for task scheduling


</td></tr>
<tr><td>

timezone


</td><td>

string


</td><td>

_(Optional)_ Timezone for the schedule

Cron expression format: \* Seconds: 0-59 \* Minutes: 0-59 \* Hours: 0-23 \* Day of Month: 1-31 \* Months: 1-12 (Jan-Dec) \* Day of Week: 1-7 (Sun-Sat)


</td></tr>
</tbody></table>
**Returns:**

MethodDecorator

{<!-- -->MethodDecorator<!-- -->}

## Exceptions

{<!-- -->Error<!-- -->} When cron expression is invalid or decorator is used on wrong class type

