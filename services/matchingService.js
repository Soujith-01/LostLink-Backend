import ItemModel from '../models/ItemModel.js';

const calculateTextSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  const normalize = (text) =>
    text
      .toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .split(/\s+/)
      .filter(Boolean);

  const tokens1 = new Set(normalize(str1));
  const tokens2 = new Set(normalize(str2));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);

  return intersection.size / union.size;
};

const calculateDateProximity = (date1, date2) => {
  if (!date1 || !date2) return 0;
  const diffInMs = Math.abs(new Date(date1) - new Date(date2));
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

  if (diffInDays <= 3) return 1.0;
  if (diffInDays >= 30) return 0;
  return 1 - (diffInDays - 3) / 27;
};

const calculateLocationScore = (loc1, loc2) => {
  if (!loc1 || !loc2) return 0;
  const city1 = (loc1.city || '').toLowerCase().trim();
  const city2 = (loc2.city || '').toLowerCase().trim();
  if (city1 !== city2) return 0;

  const area1 = (loc1.area || '').toLowerCase().trim();
  const area2 = (loc2.area || '').toLowerCase().trim();

  if (area1 && area2) {
    if (area1 === area2) return 1.0;
    const similarity = calculateTextSimilarity(area1, area2);
    return 0.6 + similarity * 0.4;
  }

  return 0.7;
};

export const findItemMatches = async (targetItemId, limit = 10) => {
  const targetItem = await ItemModel.findById(targetItemId);
  if (!targetItem) {
    throw new Error('Target item not found');
  }

  const oppositeType = targetItem.type === 'lost' ? 'found' : 'lost';

  const candidateItems = await ItemModel.find({
    _id: { $ne: targetItemId },
    type: oppositeType,
    status: 'active',
  }).populate('postedBy', 'name email avatar');

  const matches = candidateItems.map((candidate) => {
    const categoryScore =
      targetItem.category.toLowerCase().trim() === candidate.category.toLowerCase().trim() ? 1.0 : 0;
    const titleScore = calculateTextSimilarity(targetItem.title, candidate.title);
    const descriptionScore = calculateTextSimilarity(targetItem.description, candidate.description);
    const locationScore = calculateLocationScore(targetItem.location, candidate.location);
    const dateScore = calculateDateProximity(targetItem.date, candidate.date);

    const rawScore =
      categoryScore * 0.3 +
      titleScore * 0.25 +
      descriptionScore * 0.2 +
      locationScore * 0.15 +
      dateScore * 0.1;

    const matchScore = Math.round(rawScore * 100);

    let confidence = 'low';
    if (matchScore >= 75) confidence = 'high';
    else if (matchScore >= 45) confidence = 'medium';

    return {
      item: candidate,
      matchScore,
      confidence,
      scoreBreakdown: {
        category: Math.round(categoryScore * 100),
        title: Math.round(titleScore * 100),
        description: Math.round(descriptionScore * 100),
        location: Math.round(locationScore * 100),
        date: Math.round(dateScore * 100),
      },
    };
  });

  return matches
    .filter((m) => m.matchScore >= 20)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
};
