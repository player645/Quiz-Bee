# Question bank notes

All 64 original questions were migrated unchanged by `scripts/migrate-original.mjs`
(`legacy/original-index.html` is kept untouched). `npm test` re-parses the original
file and checks every question, answer, accepted-answer list and explanation against
`src/data/defaultQuestions.ts`.

## Added during migration
* Ids (`hist-mc-01`, `cult-id-03`, ...), a `difficulty` label and a `points` value per question.
* Difficulty labels (20 easy, 33 medium, 11 hard) are **my initial judgment, not independently
  validated**. Edit them in `scripts/migrate-original.mjs` (then run `npm run migrate:questions`)
  or directly in `src/data/defaultQuestions.ts`.
* Only 2 multiple-choice questions are labelled hard, so "Hard + multiple choice" runs are short;
  the app says so and offers the maximum available.

## Items to review (nothing was changed)
1. **La Solidaridad editor (hist-id-07).** The explanation says Lopez Jaena edited it "from 1889" and
   that del Pilar took over "in 1889". Both can be true only if the months are given
   (first issue February 1889; del Pilar became editor late in 1889). Consider naming the months.
2. **Lenient accepted answers.** Several identification lists accept a single distinctive word
   (for example "polo", "laurel", "benham", "verde island"). This is the original behavior and was kept.
3. **Exact-match scoring.** There is no fuzzy matching. A misspelling that is not in the accepted list
   is marked wrong, as in the original. Add variants to a question's `accepted` list to allow them.
4. **Facts.** I did not independently re-verify the factual content of the 64 questions against
   outside sources. Please have a subject expert review the bank before using it in a graded competition.

## The Dola game screenshots
Your screenshots show a separate 50-question, 15-second game. Those questions were not provided as
text, so they are **not** in this bank. Send them (text or JSON) and they can be added as extra
questions without changing the engine.
