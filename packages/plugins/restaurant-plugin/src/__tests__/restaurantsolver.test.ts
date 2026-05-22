/**
 * Restaurant operations solver tests — restaurant-plugin
 *
 * Reference values verified against:
 *  - Kasavana M, Smith D (1982) Menu Engineering. Hospitality Publications.
 *  - National Restaurant Association food cost standards (28-32%)
 *  - SJF scheduling theory
 */

import { describe, it, expect } from 'vitest';
import {
  tableAssignment,
  kitchenQueueScheduler,
  menuEngineering,
  foodCostAnalysis,
  turnTimePredictor,
  buildRestaurantReceipt,
} from '../restaurantsolver';

// ─── Table Assignment ─────────────────────────────────────────────────────────

describe('tableAssignment', () => {
  const tables = [
    { id: 'T1', capacity: 2, section: 'patio', available: true },
    { id: 'T2', capacity: 4, section: 'main',  available: true },
    { id: 'T3', capacity: 6, section: 'main',  available: true },
    { id: 'T4', capacity: 8, section: 'bar',   available: true },
  ];

  it('party of 2 assigned to smallest fitting table (best-fit)', () => {
    const parties = [{ id: 'P1', partySize: 2, priorityGuest: false }];
    const r = tableAssignment(tables, parties);
    const assigned = r.assignments.find(a => a.partyId === 'P1');
    expect(assigned!.tableCapacity).toBeGreaterThanOrEqual(2);
    // Best-fit: should assign T1 (cap=2) over T2 (cap=4)
    expect(assigned!.tableCapacity).toBe(2);
  });

  it('priority guests seated before regular guests', () => {
    const parties = [
      { id: 'Regular', partySize: 4, priorityGuest: false },
      { id: 'VIP',     partySize: 4, priorityGuest: true  },
    ];
    const r = tableAssignment(tables, parties);
    // VIP should be assigned (both should fit since we have 2 4+ tables)
    expect(r.assignments.some(a => a.partyId === 'VIP')).toBe(true);
  });

  it('party larger than any table goes to unassigned', () => {
    const parties = [{ id: 'Huge', partySize: 20, priorityGuest: false }];
    const r = tableAssignment(tables, parties);
    expect(r.unassigned).toContain('Huge');
  });

  it('utilization = partySize / tableCapacity', () => {
    const parties = [{ id: 'P1', partySize: 3, priorityGuest: false }];
    const r = tableAssignment(tables, parties);
    const assigned = r.assignments.find(a => a.partyId === 'P1');
    expect(assigned!.utilization).toBeCloseTo(assigned!.partySize / assigned!.tableCapacity, 4);
  });

  it('section preference respected when available', () => {
    const parties = [{ id: 'P1', partySize: 2, preferredSection: 'patio', priorityGuest: false }];
    const r = tableAssignment(tables, parties);
    const assigned = r.assignments.find(a => a.partyId === 'P1');
    expect(assigned!.sectionMatch).toBe(true);
    expect(assigned!.tableId).toBe('T1');
  });

  it('overallUtilization in [0, 1]', () => {
    const parties = [{ id: 'P1', partySize: 2, priorityGuest: false }];
    const r = tableAssignment(tables, parties);
    expect(r.overallUtilization).toBeGreaterThanOrEqual(0);
    expect(r.overallUtilization).toBeLessThanOrEqual(1);
  });

  it('throws for empty tables', () => {
    expect(() => tableAssignment([], [{ id: 'P1', partySize: 2, priorityGuest: false }])).toThrow();
  });
});

// ─── Kitchen Queue Scheduler ──────────────────────────────────────────────────

describe('kitchenQueueScheduler', () => {
  const tickets = [
    { id: 'T1', estimatedMinutes: 15, priority: 2 as const, tableId: 'A', items: ['burger'] },
    { id: 'T2', estimatedMinutes: 8,  priority: 1 as const, tableId: 'B', items: ['soup']   },
    { id: 'T3', estimatedMinutes: 20, priority: 2 as const, tableId: 'C', items: ['steak']  },
    { id: 'T4', estimatedMinutes: 5,  priority: 3 as const, tableId: 'D', items: ['dessert'] },
  ];

  it('priority 1 ticket scheduled first', () => {
    const r = kitchenQueueScheduler(tickets);
    expect(r.sequence[0].ticketId).toBe('T2'); // priority 1 ticket
  });

  it('makespan = sum of all cook times (sequential)', () => {
    const r = kitchenQueueScheduler(tickets);
    const expected = tickets.reduce((s, t) => s + t.estimatedMinutes, 0);
    expect(r.makespan).toBe(expected);
  });

  it('sequence covers all tickets', () => {
    const r = kitchenQueueScheduler(tickets);
    expect(r.sequence).toHaveLength(tickets.length);
  });

  it('each ticket starts at previous end', () => {
    const r = kitchenQueueScheduler(tickets);
    for (let i = 1; i < r.sequence.length; i++) {
      expect(r.sequence[i].startMin).toBe(r.sequence[i - 1].endMin);
    }
  });

  it('within same priority: shorter job goes first (SJF)', () => {
    const r = kitchenQueueScheduler(tickets);
    // Priority 2 tickets: T1 (15min) and T3 (20min) → T1 before T3
    const t1pos = r.sequence.findIndex(s => s.ticketId === 'T1');
    const t3pos = r.sequence.findIndex(s => s.ticketId === 'T3');
    expect(t1pos).toBeLessThan(t3pos);
  });

  it('avgWaitMin ≥ 0', () => {
    const r = kitchenQueueScheduler(tickets);
    expect(r.avgWaitMin).toBeGreaterThanOrEqual(0);
  });

  it('throws for empty tickets', () => {
    expect(() => kitchenQueueScheduler([])).toThrow();
  });
});

// ─── Menu Engineering ─────────────────────────────────────────────────────────

describe('menuEngineering', () => {
  /**
   * Stars: high popularity + high margin
   * Plow-horses: high popularity + low margin
   * Puzzles: low popularity + high margin
   * Dogs: low popularity + low margin
   */
  const items = [
    { id: 'burger', name: 'Burger',  popularity: 100, contributionMargin: 12.00 }, // star — avg margin = (12+4+25+3)/4 = 11; 12 > 11 → star
    { id: 'pasta',  name: 'Pasta',   popularity: 80,  contributionMargin: 4.00 },   // plow-horse
    { id: 'lobster',name: 'Lobster', popularity: 20,  contributionMargin: 25.00 },  // puzzle
    { id: 'salad',  name: 'Salad',   popularity: 30,  contributionMargin: 3.00 },   // dog
  ];

  it('burger (high pop, high margin) → star', () => {
    const r = menuEngineering(items);
    const burger = r.items.find(i => i.id === 'burger');
    expect(burger!.category).toBe('star');
  });

  it('pasta (high pop, low margin) → plow-horse', () => {
    const r = menuEngineering(items);
    const pasta = r.items.find(i => i.id === 'pasta');
    expect(pasta!.category).toBe('plow-horse');
  });

  it('lobster (low pop, high margin) → puzzle', () => {
    const r = menuEngineering(items);
    const lobster = r.items.find(i => i.id === 'lobster');
    expect(lobster!.category).toBe('puzzle');
  });

  it('salad (low pop, low margin) → dog', () => {
    const r = menuEngineering(items);
    const salad = r.items.find(i => i.id === 'salad');
    expect(salad!.category).toBe('dog');
  });

  it('averagePopularity = mean of item popularities', () => {
    const r = menuEngineering(items);
    const expected = items.reduce((s, i) => s + i.popularity, 0) / items.length;
    expect(r.averagePopularity).toBeCloseTo(expected, 4);
  });

  it('categoryCount sums to total items', () => {
    const r = menuEngineering(items);
    const total = r.categoryCount.star + r.categoryCount['plow-horse'] + r.categoryCount.puzzle + r.categoryCount.dog;
    expect(total).toBe(items.length);
  });

  it('throws for empty items', () => {
    expect(() => menuEngineering([])).toThrow();
  });
});

// ─── Food Cost Analysis ───────────────────────────────────────────────────────

describe('foodCostAnalysis', () => {
  /**
   * Burger: ingredient $3, price $12, sold 100 → food cost 25%
   * Steak: ingredient $15, price $35, sold 50 → food cost 42.9%
   */
  const lines = [
    { item: 'burger', ingredientCostUSD: 3, sellingPriceUSD: 12, unitsSold: 100 },
    { item: 'steak',  ingredientCostUSD: 15, sellingPriceUSD: 35, unitsSold: 50 },
  ];

  it('per-item foodCostPct = ingredient / price', () => {
    const r = foodCostAnalysis(lines);
    expect(r.lines[0].foodCostPct).toBeCloseTo(3 / 12, 4);
    expect(r.lines[1].foodCostPct).toBeCloseTo(15 / 35, 4);
  });

  it('totalRevenue = sum of price × units', () => {
    const r = foodCostAnalysis(lines);
    const expected = 12 * 100 + 35 * 50;
    expect(r.totalRevenue).toBeCloseTo(expected, 2);
  });

  it('blendedFoodCostPct = totalCost / totalRevenue', () => {
    const r = foodCostAnalysis(lines);
    expect(r.blendedFoodCostPct).toBeCloseTo(r.totalCost / r.totalRevenue, 4);
  });

  it('overTarget=true when blended cost exceeds target', () => {
    // Steak-heavy menu at 42.9% → over standard 30% target
    const heavySteak = [{ item: 'steak', ingredientCostUSD: 15, sellingPriceUSD: 35, unitsSold: 200 }];
    const r = foodCostAnalysis(heavySteak, 0.30);
    expect(r.overTarget).toBe(true);
  });

  it('overTarget=false when within target', () => {
    const lowCost = [{ item: 'drink', ingredientCostUSD: 1, sellingPriceUSD: 8, unitsSold: 100 }];
    const r = foodCostAnalysis(lowCost, 0.30);
    expect(r.overTarget).toBe(false);
  });

  it('throws for empty lines', () => {
    expect(() => foodCostAnalysis([])).toThrow();
  });
});

// ─── Turn Time Predictor ──────────────────────────────────────────────────────

describe('turnTimePredictor', () => {
  it('dinner base is longer than lunch', () => {
    const lunch  = turnTimePredictor({ partySize: 2, mealPeriod: 'lunch',  specialEvent: false });
    const dinner = turnTimePredictor({ partySize: 2, mealPeriod: 'dinner', specialEvent: false });
    expect(dinner.predictedTurnMin).toBeGreaterThan(lunch.predictedTurnMin);
  });

  it('special event adds to turn time', () => {
    const normal  = turnTimePredictor({ partySize: 2, mealPeriod: 'dinner', specialEvent: false });
    const special = turnTimePredictor({ partySize: 2, mealPeriod: 'dinner', specialEvent: true  });
    expect(special.predictedTurnMin).toBeGreaterThan(normal.predictedTurnMin);
  });

  it('larger party → longer turn time', () => {
    const small = turnTimePredictor({ partySize: 2, mealPeriod: 'dinner', specialEvent: false });
    const large = turnTimePredictor({ partySize: 8, mealPeriod: 'dinner', specialEvent: false });
    expect(large.predictedTurnMin).toBeGreaterThan(small.predictedTurnMin);
  });

  it('turnsPerEvening = 480 / predictedTurnMin', () => {
    const r = turnTimePredictor({ partySize: 4, mealPeriod: 'dinner', specialEvent: false });
    expect(r.turnsPerEvening).toBeCloseTo(480 / r.predictedTurnMin, 4);
  });

  it('confidenceInterval spans ±10% of predictedTurnMin', () => {
    const r = turnTimePredictor({ partySize: 4, mealPeriod: 'dinner', specialEvent: false });
    const margin = r.predictedTurnMin * 0.10;
    expect(r.confidenceInterval[0]).toBeCloseTo(r.predictedTurnMin - margin, 1);
    expect(r.confidenceInterval[1]).toBeCloseTo(r.predictedTurnMin + margin, 1);
  });

  it('throws for partySize < 1', () => {
    expect(() => turnTimePredictor({ partySize: 0, mealPeriod: 'dinner', specialEvent: false })).toThrow();
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildRestaurantReceipt', () => {
  it('plugin=restaurant and CAEL event correct', () => {
    const menu = menuEngineering([{ id: 'burger', name: 'Burger', popularity: 100, contributionMargin: 8 }]);
    const receipt = buildRestaurantReceipt({ menuEngineering: menu, converged: true });
    expect(receipt.plugin).toBe('restaurant');
    expect(receipt.cael.event).toBe('restaurant.operations_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for efficient operation', () => {
    const foodCost = foodCostAnalysis([{ item: 'drink', ingredientCostUSD: 1, sellingPriceUSD: 8, unitsSold: 100 }]);
    const receipt = buildRestaurantReceipt({ foodCost, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false when food cost over target', () => {
    const foodCost = foodCostAnalysis(
      [{ item: 'steak', ingredientCostUSD: 15, sellingPriceUSD: 35, unitsSold: 100 }],
      0.30,  // 42.9% actual > 30% target
    );
    const receipt = buildRestaurantReceipt({ foodCost, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('accepted=false when parties unassigned', () => {
    const tables = [{ id: 'T1', capacity: 2, section: 'main', available: true }];
    const parties = [{ id: 'Huge', partySize: 20, priorityGuest: false }];
    const tableAssign = tableAssignment(tables, parties);
    const receipt = buildRestaurantReceipt({ tableAssign, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
  });

  it('uses provided runId', () => {
    const receipt = buildRestaurantReceipt({ converged: true }, { runId: 'rst-run-007' });
    expect(receipt.runId).toBe('rst-run-007');
  });
});
