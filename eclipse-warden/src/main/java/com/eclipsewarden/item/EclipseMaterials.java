package com.eclipsewarden.item;

import com.eclipsewarden.EclipseWarden;
import com.eclipsewarden.registry.ModItems;
import java.util.EnumMap;
import java.util.List;
import net.minecraft.block.Block;
import net.minecraft.item.ArmorItem;
import net.minecraft.item.ArmorMaterial;
import net.minecraft.item.ToolMaterial;
import net.minecraft.recipe.Ingredient;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.registry.tag.BlockTags;
import net.minecraft.registry.tag.TagKey;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.Util;

public final class EclipseMaterials {
	/** One step above netherite: the blade lands 9 damage. */
	public static final ToolMaterial TOOL = new ToolMaterial() {
		@Override
		public int getDurability() {
			return 2600;
		}

		@Override
		public float getMiningSpeedMultiplier() {
			return 9.0f;
		}

		@Override
		public float getAttackDamage() {
			return 5.0f;
		}

		@Override
		public TagKey<Block> getInverseTag() {
			return BlockTags.INCORRECT_FOR_NETHERITE_TOOL;
		}

		@Override
		public int getEnchantability() {
			return 20;
		}

		@Override
		public Ingredient getRepairIngredient() {
			return Ingredient.ofItems(ModItems.UMBRAL_SHARD);
		}
	};

	public static final RegistryEntry<ArmorMaterial> ARMOR = Registry.registerReference(Registries.ARMOR_MATERIAL,
			EclipseWarden.id("warden"), new ArmorMaterial(Util.make(new EnumMap<>(ArmorItem.Type.class), map -> {
				map.put(ArmorItem.Type.BOOTS, 3);
				map.put(ArmorItem.Type.LEGGINGS, 6);
				map.put(ArmorItem.Type.CHESTPLATE, 8);
				map.put(ArmorItem.Type.HELMET, 4);
				map.put(ArmorItem.Type.BODY, 11);
			}), 22, SoundEvents.ITEM_ARMOR_EQUIP_NETHERITE, () -> Ingredient.ofItems(ModItems.UMBRAL_SHARD),
					List.of(new ArmorMaterial.Layer(EclipseWarden.id("warden"))), 3.0f, 0.1f));

	private EclipseMaterials() {
	}
}
