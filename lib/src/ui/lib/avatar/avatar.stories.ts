import type { Meta, StoryObj } from '@storybook/angular';
import { Avatar } from './avatar';

const meta: Meta<Avatar> = {
  component: Avatar,
  title: 'Avatar',
};
export default meta;

type Story = StoryObj<Avatar>;

export const Primary: Story = {
  args: {},
};
