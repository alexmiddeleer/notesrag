---
name: orchestrate
description: Orchestrate multiple sub-agents to collaboratively complete a complex plan.
---
Use this skill to execute plan.md (found at root of project). Analyze the pending tasks & todos listed in the document and plan out how to split them up into subtasks. 

For each task, spawn an agent using #runSubagent, and ensure you orchestrate them properly. It is probably necessary to run them sequentually to avoid conflicts, but if you are able, you are encouraged to use parallel agents to speed up development. For example, if you need to do research before starting the implementation phase, consider using multiple parallel agents: one to analyze the codebase, one to find best practices, one to read the docs, et cetera. 

You have explicit instructions to continue development until the entire plan is finished. do not stop orchestrating subagents until all planned tasks are fully implemented, tested, and verified up and running. 

Each agent should be prompted clearly, concisely, and told where to repo-specific coding practices (if applicable).