package com.eclipsewarden.item;

import java.util.List;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

/** An item whose tooltip shows the translation "<item key>.tooltip". */
public class LoreItem extends Item {
	public LoreItem(Settings settings) {
		super(settings);
	}

	@Override
	public void appendTooltip(ItemStack stack, TooltipContext context, List<Text> tooltip, TooltipType type) {
		appendLore(stack, tooltip);
	}

	public static void appendLore(ItemStack stack, List<Text> tooltip) {
		tooltip.add(Text.translatable(stack.getTranslationKey() + ".tooltip").formatted(Formatting.GRAY));
	}
}
