import type { Meta, StoryObj } from '@storybook/angular';
import { ErrorState } from './error-state';

const meta: Meta<ErrorState> = {
  component: ErrorState,
  title: 'ErrorState',
};
export default meta;

type Story = StoryObj<ErrorState>;

export const Primary: Story = {
  args: {},
};
