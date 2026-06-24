import type { Meta, StoryObj } from '@storybook/angular';
import { Pagination } from './pagination';

const meta: Meta<Pagination> = {
  component: Pagination,
  title: 'Pagination',
};
export default meta;

type Story = StoryObj<Pagination>;

export const Primary: Story = {
  args: {},
};
