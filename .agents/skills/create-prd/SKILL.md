---
name: create-prd
description: Creates or updates a Product Requirements Document (PRD) defining measurable goals, scope, and acceptance criteria. Use for product or feature requirements; not for technical specifications or implementation task lists.
---

# Create PRD

Define the problem, users, expected outcomes, constraints, and scope.
Architecture and implementation belong in the TechSpec.

## Workflow

1. **Inspect context** — read supplied requirements, existing product documents,
   and applicable repository instructions that exist. For an update, read the
   current PRD and dependent TechSpec/tasks first. Reuse provided answers.
   **Complete when:** the target feature and available evidence are clear.

2. **Clarify material gaps** — ask only unresolved questions about:
   - Problem, primary users, and measurable goals
   - Main flows, inputs, outputs, and business rules
   - Constraints, dependencies, and out-of-scope items
   - UI/UX, accessibility, and nonfunctional requirements

   Use the available question tool or plain chat. Research public facts using
   primary sources; ask about private product policies. Record assumptions
   explicitly; do not invent decisions that materially change scope.
   **Complete when:** every template section has evidence or a documented
   assumption, and blocking scope decisions have an answer.

3. **Write** — read [the template](references/TEMPLATE.md) and preserve its
   sections. Assign stable acceptance IDs (`CA-01`, `CA-02`, …), linked to
   user stories or functional requirements. Cover observable happy paths,
   relevant failure/empty states, and permission boundaries. Give measurable
   targets units and conditions. Mark irrelevant sections NOT APPLICABLE
   with a reason instead of filling them with generic text.
   **Complete when:** criteria are verifiable, requirements fit the agreed
   scope, and assumptions and open decisions are visible.

4. **Save and verify** — save to `tasks/prd-[slug]/prd.md`, using a kebab-case
   slug. Preserve existing IDs during updates; flag dependent artifacts that
   need revision. Check links, duplicate IDs, and contradictions. Report the
   path and material assumptions. A PRD request authorizes this document;
   implementation follows only when included in the user's request.
