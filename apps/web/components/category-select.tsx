'use client';

import { roomCategories, type RoomCategory } from '@livepulse/contracts';

import { CategoryIcon } from './category-icon';

/** A one-line category switcher for the on-air bar. */
export function CategorySelect({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange(value: RoomCategory): void;
  value: RoomCategory;
}) {
  return (
    <label className="studio-category-select">
      <CategoryIcon category={value} />
      <span className="sr-only">Category</span>
      <select
        disabled={disabled}
        onChange={(event) =>
          onChange(event.currentTarget.value as RoomCategory)
        }
        value={value}
      >
        {roomCategories.map((category) => (
          <option key={category.slug} value={category.slug}>
            {category.name}
          </option>
        ))}
      </select>
    </label>
  );
}
