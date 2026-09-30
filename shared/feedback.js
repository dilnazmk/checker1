function snippetOf(text, maxLength = 140) {
  const trimmed = text.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength).trim()}…` : trimmed;
}

export function feedbackFor(score, chunks) {
  let verdict;
  let summary;
  if (score < 25) {
    verdict = 'Looks like your own work';
    summary = 'The check found mostly consistent, natural writing patterns across the text. Keep your drafts, notes, and sources as evidence of your process in case it is ever requested.';
  } else if (score < 50) {
    verdict = 'Mostly consistent, a few flags';
    summary = 'Most of the text reads as your own writing, but a few passages resemble common AI phrasing. Reread the flagged fragments below and rewrite them in your own words if they don\u2019t reflect how you actually wrote them.';
  } else if (score < 75) {
    verdict = 'Mixed signals';
    summary = 'A significant share of the text resembles common AI-generated patterns: generic transitions, overly uniform sentence structure, or a lack of concrete personal detail. Review the flagged fragments, add specific examples, and rewrite generic phrasing before you submit.';
  } else {
    verdict = 'Review recommended';
    summary = 'Most of the text closely resembles AI-generated patterns. This is only a screening signal, not proof — but it\u2019s worth rewriting the flagged sections in your own voice, with your own examples, before submitting.';
  }

  const flagged = chunks
    .map((chunk, index) => ({ ...chunk, index }))
    .filter((chunk) => chunk.score >= 55)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const items = [];
  items.push({
    icon: score < 25 ? 'mint' : score < 75 ? 'yellow' : 'coral',
    symbol: score < 25 ? '✓' : score < 75 ? '↗' : '✦',
    title: verdict,
    detail: summary,
  });

  if (flagged.length && chunks.length > 1) {
    flagged.forEach((chunk) => {
      items.push({
        icon: chunk.score >= 75 ? 'coral' : 'yellow',
        symbol: '✦',
        title: `Fragment ${chunk.index + 1} of ${chunks.length} — ${chunk.score}% resembles AI patterns`,
        detail: `“${snippetOf(chunk.text)}”`,
      });
    });
  } else if (!flagged.length && chunks.length > 1) {
    items.push({
      icon: 'mint',
      symbol: '✓',
      title: 'No single fragment stood out',
      detail: 'No individual part of the text scored high enough on its own to flag specifically.',
    });
  }

  items.push({
    icon: 'mint',
    symbol: '✓',
    title: 'This is a screening signal, not a verdict',
    detail: 'It is not a forensic test and must not be used alone as proof of authorship. Your teacher reviews the attempt and assigns the final grade.',
  });

  return { verdict, summary, items };
}

