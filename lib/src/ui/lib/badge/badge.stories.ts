import type { Meta, StoryObj } from '@storybook/angular';
import { Badge } from './badge';

const meta: Meta<Badge> = {
  component: Badge,
  title: 'Badge',
};
export default meta;

type Story = StoryObj<Badge>;

export const Primary: Story = {
  args: {},
};
