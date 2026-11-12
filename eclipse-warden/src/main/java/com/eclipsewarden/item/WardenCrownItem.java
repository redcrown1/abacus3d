package com.eclipsewarden.item;

import java.util.List;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ArmorItem;
import net.minecraft.item.ArmorMaterial;
import net.minecraft.item.ItemStack;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.text.Text;
import net.minecraft.world.World;

public class WardenCrownItem extends ArmorItem {
	public WardenCrownItem(RegistryEntry<ArmorMaterial> material, Settings settings) {
		super(material, Type.HELMET, settings);
	}

	@Override
	public void inventoryTick(ItemStack stack, World world, Entity entity, int slot, boolean selected) {
		if (!world.isClient && world.getTime() % 40 == 0 && entity instanceof PlayerEntity player
				&& player.getEquippedStack(EquipmentSlot.HEAD) == stack) {
			// refreshed well before the under-10s flicker starts
			player.addStatusEffect(new StatusEffectInstance(StatusEffects.NIGHT_VISION, 320, 0, true, false, true));
		}
	}

	@Override
	public void appendTooltip(ItemStack stack, TooltipContext context, List<Text> tooltip, TooltipType type) {
		LoreItem.appendLore(stack, tooltip);
	}
}
