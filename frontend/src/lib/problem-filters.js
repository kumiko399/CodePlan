export const tagsOf = (problem) => [
  ...new Set(
    (problem.tags || "")
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean),
  ),
];
export function filterProblems(problems, filters, passedIds) {
  return problems.filter((p) => {
    const tags = tagsOf(p);
    return (
      (!filters.search ||
        `${p.title} ${p.number} ${p.tags}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())) &&
      (!filters.difficulty || p.difficulty === filters.difficulty) &&
      (!filters.favorite || p.details.favorite) &&
      (!filters.challenge || p.details.challenge) &&
      (!filters.passed || passedIds.has(p.id) === (filters.passed === "yes")) &&
      (!filters.tags.length ||
        filters.tags.some((tag) =>
          tag === "none:" ? !tags.length : tags.includes(tag.slice(4)),
        ))
    );
  });
}
