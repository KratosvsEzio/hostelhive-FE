import type { Meta, StoryObj } from '@storybook/angular';
import { EmptyState } from './empty-state';

const meta: Meta<EmptyState> = {
  component: EmptyState,
  title: 'EmptyState',
};
export default meta;

type Story = StoryObj<EmptyState>;

export const Primary: Story = {
  args: {},
};
