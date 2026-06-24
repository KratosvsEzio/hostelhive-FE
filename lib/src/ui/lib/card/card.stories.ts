import type { Meta, StoryObj } from '@storybook/angular';
import { Card } from './card';

const meta: Meta<Card> = {
  component: Card,
  title: 'Card',
};
export default meta;

type Story = StoryObj<Card>;

export const Primary: Story = {
  args: {},
};
