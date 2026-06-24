import type { Meta, StoryObj } from '@storybook/angular';
import { Skeleton } from './skeleton';

const meta: Meta<Skeleton> = {
  component: Skeleton,
  title: 'Skeleton',
};
export default meta;

type Story = StoryObj<Skeleton>;

export const Primary: Story = {
  args: {},
};
