import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { Chip } from './chip';

const meta: Meta<Chip> = {
  title: 'Atoms/Chip',
  component: Chip,
  decorators: [moduleMetadata({ imports: [Chip] })],
};
export default meta;
type Story = StoryObj<Chip>;

export const Default: Story = {
  render: () => ({
    template: `<div class="flex flex-wrap gap-2">
      <button hh-chip [active]="true">All stays</button>
      <button hh-chip>Wi-Fi</button>
      <button hh-chip>AC</button>
    </div>`,
  }),
};
