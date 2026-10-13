---
name: create-tasks
description: Creates or updates implementation tasks from an existing PRD and TechSpec. Use to break down a feature and map dependencies, acceptance criteria, and tests; not to write requirements or architecture.
---

# Create Tasks

Use `--prd`, an unambiguous feature in the request, or a single matching
`tasks/prd-*/` directory. Ask when the target is ambiguous. Require `prd.md`
and `techspec.md`; identify missing prerequisites and the corresponding
create-prd/create-techspec workflow.

Each task is an incremental delivery with explicit scope, dependencies,
acceptance references, tests, and a completion condition. Reference the
TechSpec instead of copying implementation details.

## Workflow

1. **Inventory** — read the PRD, TechSpec, existing task files, and applicable
   repository instructions/rules that exist. Map every requirement, `CA-*`
   criterion, component, and TechSpec test case. Identify applicable skills
   and owning repositories for each task.
   **Complete when:** the source inventory and existing progress are understood.

2. **Structure** — order dependencies before consumers and include integration,
   migration, and validation work when required. Prefer a manageable number
   of tasks, but never combine unrelated work solely to meet a quota. Give
   each task explicit prerequisite task IDs and a verifiable delivery.
   Proceed with the requested files unless a material scope decision needs
   the user; do not add a preliminary approval gate to ordinary planning.
   **Complete when:** the graph has no cycles or unresolved dependencies.

3. **Generate** — in `tasks/prd-[slug]/`, write:
   - `tasks.md` using [the summary template](references/TEMPLATE_TASKS.md).
   - `task_[num].md` using [the task template](references/TEMPLATE_TASK.md),
     with sequential IDs starting at 1 and subtasks `[num].1`, `[num].2`, ….

   Map every `CA-*` and named TechSpec test to one or more tasks. Mark
   irrelevant test layers NOT APPLICABLE with reasons. Preserve existing IDs,
   checked progress, and user edits when revising; append new tasks instead
   of silently renumbering references.
   **Complete when:** all inventory items are mapped and every task has clear
   dependencies, scope, checks, and completion criteria.

4. **Verify and report** — check mappings, filenames, identifiers, dependency
   order, and consistency between summary and task files. Present concrete
   file links. Begin implementation only when the user's request includes it;
   reuse authorization already given rather than asking again.
