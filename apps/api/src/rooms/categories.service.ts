import { Injectable } from '@nestjs/common';
import { roomCategories, type CategorySummary } from '@livepulse/contracts';

import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class CategoriesService {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Lists every category with its number of live rooms, busiest first. Ties
   * keep the fixed catalogue order so the page layout stays stable.
   */
  public async list(): Promise<CategorySummary[]> {
    const groups = await this.database.client.room.groupBy({
      _count: { _all: true },
      by: ['category'],
      where: { status: 'LIVE' },
    });
    const liveCounts = new Map(
      groups.map((group) => [group.category, group._count._all]),
    );

    return roomCategories
      .map((category, order) => ({
        order,
        summary: {
          description: category.description,
          liveCount: liveCounts.get(category.slug) ?? 0,
          name: category.name,
          slug: category.slug,
        },
      }))
      .sort(
        (left, right) =>
          right.summary.liveCount - left.summary.liveCount ||
          left.order - right.order,
      )
      .map(({ summary }) => summary);
  }
}
