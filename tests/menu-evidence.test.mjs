import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesPhraseBoundary,
  containsNegativeSentiment,
  validateRecommendationGrounding
} from '../services/menuEvidence.ts';

test('matchesPhraseBoundary prevents short word false matches (ham vs champagne)', () => {
  assert.equal(matchesPhraseBoundary('I ordered the champagne for celebration', 'ham'), false);
  assert.equal(matchesPhraseBoundary('Delicious ham and cheese sandwich', 'ham'), true);
  assert.equal(matchesPhraseBoundary('Order the pork-ham today', 'ham'), true);
  assert.equal(matchesPhraseBoundary('삼겹살이 너무 맛있어요', '삼겹살'), true);
  assert.equal(matchesPhraseBoundary('대패삼겹살이 맛있어요', '삼겹살'), false);
});

test('containsNegativeSentiment detects conservative negative phrases in English and Korean', () => {
  assert.equal(containsNegativeSentiment('The steak was terrible and cold'), true);
  assert.equal(containsNegativeSentiment('It was overpriced and bland'), true);
  assert.equal(containsNegativeSentiment('너무 짜고 맛없어요'), true);
  assert.equal(containsNegativeSentiment('별로였고 돈아까움'), true);
  assert.equal(containsNegativeSentiment('Crispy and juicy perfection!'), false);
  assert.equal(containsNegativeSentiment('진짜 맛있고 부드러워요'), false);
});

test('validateRecommendationGrounding rejects fabricated item IDs and quotes', () => {
  const items = [{ id: 'item_1', name: 'Truffle Pasta' }];
  const reviews = [
    {
      rating: 5,
      text: 'The Truffle Pasta here is incredible and flavorful.'
    }
  ];

  // Fabricated itemId
  const fabricatedItemOutput = {
    recommendations: [
      {
        itemId: 'item_999',
        positive: true,
        evidence: [{ reviewIndex: 0, quote: 'The Truffle Pasta here is incredible' }]
      }
    ]
  };
  assert.deepEqual(validateRecommendationGrounding(items, reviews, fabricatedItemOutput), []);

  // Fabricated quote not in source review
  const fabricatedQuoteOutput = {
    recommendations: [
      {
        itemId: 'item_1',
        positive: true,
        evidence: [{ reviewIndex: 0, quote: 'This dish is simply divine' }]
      }
    ]
  };
  assert.deepEqual(validateRecommendationGrounding(items, reviews, fabricatedQuoteOutput), []);
});

test('validateRecommendationGrounding rejects reviews with rating < 4 or negative sentiment', () => {
  const items = [{ id: 'item_1', name: 'Burger' }];
  const reviews = [
    {
      rating: 3,
      text: 'The Burger was good but waited 40 minutes.'
    },
    {
      rating: 4,
      text: 'The Burger was terrible and dry.'
    }
  ];

  const outputRating3 = {
    recommendations: [
      {
        itemId: 'item_1',
        positive: true,
        evidence: [{ reviewIndex: 0, quote: 'The Burger was good' }]
      }
    ]
  };
  assert.deepEqual(validateRecommendationGrounding(items, reviews, outputRating3), []);

  const outputNegativeQuote = {
    recommendations: [
      {
        itemId: 'item_1',
        positive: true,
        evidence: [{ reviewIndex: 1, quote: 'The Burger was terrible' }]
      }
    ]
  };
  assert.deepEqual(validateRecommendationGrounding(items, reviews, outputNegativeQuote), []);
});

test('validateRecommendationGrounding deduplicates items and reviews, enforces max 3 items', () => {
  const items = [
    { id: '1', name: 'Pizza' },
    { id: '2', name: 'Pasta' },
    { id: '3', name: 'Salad' },
    { id: '4', name: 'Soup' }
  ];
  const reviews = [
    { rating: 5, text: 'The Pizza and Pasta are wonderful!' },
    { rating: 5, text: 'Fresh Salad with crisp greens.' },
    { rating: 5, text: 'Warm Soup on a cold evening.' }
  ];

  const output = {
    recommendations: [
      {
        itemId: '1',
        positive: true,
        evidence: [
          { reviewIndex: 0, quote: 'The Pizza and Pasta are wonderful!' },
          { reviewIndex: 0, quote: 'The Pizza and Pasta are wonderful!' } // duplicate review
        ]
      },
      {
        itemId: '1', // duplicate item ID
        positive: true,
        evidence: [{ reviewIndex: 0, quote: 'The Pizza and Pasta are wonderful!' }]
      },
      {
        itemId: '2',
        positive: true,
        evidence: [{ reviewIndex: 0, quote: 'The Pizza and Pasta are wonderful!' }]
      },
      {
        itemId: '3',
        positive: true,
        evidence: [{ reviewIndex: 1, quote: 'Fresh Salad with crisp greens.' }]
      },
      {
        itemId: '4',
        positive: true,
        evidence: [{ reviewIndex: 2, quote: 'Warm Soup on a cold evening.' }]
      }
    ]
  };

  const grounded = validateRecommendationGrounding(items, reviews, output);
  assert.equal(grounded.length, 3);
  assert.equal(grounded[0].item.id, '1');
  assert.equal(grounded[0].evidences.length, 1); // deduplicated review evidence
  assert.equal(grounded[1].item.id, '2');
  assert.equal(grounded[2].item.id, '3');
});

test('validateRecommendationGrounding handles malformed arrays gracefully', () => {
  assert.deepEqual(validateRecommendationGrounding(null, [], {}), []);
  assert.deepEqual(validateRecommendationGrounding([], null, {}), []);
  assert.deepEqual(validateRecommendationGrounding([], [], null), []);
  assert.deepEqual(validateRecommendationGrounding([{ id: '1', name: '' }], [], { recommendations: null }), []);
});

test('clipped quotes cannot hide negative dish feedback or borrow praise for another dish',()=>{
 const item=[{id:'ham',name:'Ham'}];
 const rank=quote=>({recommendations:[{itemId:'ham',positive:true,evidence:[{reviewIndex:0,quote}]}]});
 assert.deepEqual(validateRecommendationGrounding(item,[{rating:5,text:'Do not order Ham. The service was great.'}],rank('Ham')),[]);
 assert.deepEqual(validateRecommendationGrounding(item,[{rating:5,text:'Ham was okay. The service was great.'}],rank('The service was great.')),[]);
 assert.equal(validateRecommendationGrounding(item,[{rating:5,text:'HAM was fantastic.'}],rank('HAM was fantastic.')).length,1);
});
test('duplicate upstream review identities cannot inflate sample counts',()=>{
 const review={id:'same-review',rating:5,text:'Ham was fantastic.'};
 const result=validateRecommendationGrounding([{id:'ham',name:'Ham'}],[review,{...review}],{recommendations:[{itemId:'ham',positive:true,evidence:[{reviewIndex:0,quote:review.text},{reviewIndex:1,quote:review.text}]}]});
 assert.equal(result[0].sampleMentionCount,1);
});
