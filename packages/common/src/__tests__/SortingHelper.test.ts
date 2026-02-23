import { sortByEatingHabits, sortByFoodCategoryOnly, sortByFoodName, sortByFoodOfferCategoryOnly, sortByOwnFavorite, sortByPublicFavorite, sortBySortField } from 'repo-depkit-common';

describe('SortingHelper', () => {
  test('sortByFoodName sorts alphabetically', () => {
    const offers: any = [{ food: { translations: [{ languages_code: 'en', name: 'Banana' }] } }, { food: { translations: [{ languages_code: 'en', name: 'Apple' }] } }];
    const sorted = sortByFoodName(offers, 'en');
    expect(sorted[0].food.translations[0].name).toBe('Apple');
  });

  test('sortByFoodCategoryOnly sorts by category sort value', () => {
    const categories: any = [
      { id: 'c1', sort: 2 },
      { id: 'c2', sort: 1 },
    ];
    const offers: any = [{ food: { food_category: 'c1' } }, { food: { food_category: 'c2' } }];
    const sorted = sortByFoodCategoryOnly(offers, categories);
    expect((sorted[0].food as any).food_category).toBe('c2');
  });

  test('sortByFoodOfferCategoryOnly sorts by offer category', () => {
    const categories: any = [
      { id: 'o1', sort: 3 },
      { id: 'o2', sort: 1 },
    ];
    const offers: any = [{ foodoffer_category: 'o1' }, { foodoffer_category: 'o2' }];
    const sorted = sortByFoodOfferCategoryOnly(offers, categories);
    expect(sorted[0].foodoffer_category).toBe('o2');
  });

  test('sortByPublicFavorite orders by rating average', () => {
    const offers: any = [{ food: { rating_average: 4 } }, { food: { rating_average: null } }, { food: { rating_average: 2 } }];
    const sorted = sortByPublicFavorite(offers);
    expect(sorted.map((o: any) => o.food.rating_average)).toEqual([4, null, 2]);
  });

  test('sortByOwnFavorite orders by personal rating', () => {
    const offers: any = [{ food: { id: 'f1' } }, { food: { id: 'f2' } }, { food: { id: 'f3' } }];
    const feedbacks = [
      { food: 'f1', rating: 5 },
      { food: 'f2', rating: 1 },
    ];
    const sorted = sortByOwnFavorite(offers, feedbacks);
    expect(sorted.map((o: any) => o.food.id)).toEqual(['f1', 'f3', 'f2']);
  });

  test('sortByEatingHabits orders liked, neutral, disliked', () => {
    const offers: any = [
      { id: '1', markings: [{ markings_id: 'm1' }] },
      { id: '2', markings: [{ markings_id: 'm2' }] },
      { id: '3', markings: [] },
    ];
    const profile = [
      { markings_id: 'm1', like: true },
      { markings_id: 'm2', like: false },
    ];
    const sorted = sortByEatingHabits(offers, profile);
    expect(sorted.map((o: any) => o.id)).toEqual(['1', '3', '2']);
  });

  test('sortByEatingHabits moves mixed liked and disliked offers to the end', () => {
    const offers: any = [
      { id: '1', markings: [{ markings_id: 'm1' }] },
      { id: '2', markings: [{ markings_id: 'm1' }, { markings_id: 'm2' }] },
      { id: '3', markings: [{ markings_id: 'm2' }] },
    ];
    const profile = [
      { markings_id: 'm1', like: true },
      { markings_id: 'm2', like: false },
    ];
    const sorted = sortByEatingHabits(offers, profile);
    expect(sorted.map((o: any) => o.id)).toEqual(['1', '2', '3']);
  });

  test('sortBySortField sorts numerically and keeps missing at end', () => {
    const items = [{ id: 'a', sort: 3 }, { id: 'b', sort: 1 }, { id: 'c' }];
    const sorted = sortBySortField(items);
    expect(sorted.map(i => i.id)).toEqual(['b', 'a', 'c']);
  });
});
