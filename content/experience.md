# Experience

## AI Engineer, Northwind Data (2024 to present)

I own the retrieval layer of a customer support assistant that handles about
four thousand conversations a week. When I joined, the assistant answered from
a single flat prompt and nobody could say how often it was right.

I built the first evaluation harness: a set of 120 labelled questions, scored
automatically on every deploy. The first run told us we were at 61 percent.
Within two months we were at 84 percent, and the thing that moved the number
was not the model. It was chunking. Splitting documents on headings instead of
on a fixed character count was worth 14 points on its own.

I also added a refusal path. The assistant now says it does not know rather
than inventing a policy, which cut escalations from the support team by a third.

## Full Stack Developer, Harbour Systems (2021 to 2024)

I worked on an internal logistics dashboard used by about two hundred staff.
Python on the back, React on the front, PostgreSQL underneath.

The work I am proudest of is unglamorous: I replaced a nightly batch job that
regularly failed silently with an incremental pipeline that reported its own
health. Support tickets about stale data went from roughly fifteen a month to
almost none.

I was also the person who introduced tests to that codebase. Not many, and not
quickly, but enough that the next person could change things without fear.

## Intern, Harbour Systems (2021)

Six months writing internal tooling. Mostly scripts. It taught me to read other
people's code, which is most of the job.
