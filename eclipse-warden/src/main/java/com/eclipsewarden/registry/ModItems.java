package com.eclipsewarden.registry;

import com.eclipsewarden.EclipseWarden;
import com.eclipsewarden.item.EclipseBladeItem;
import com.eclipsewarden.item.EclipseMaterials;
import com.eclipsewarden.item.LoreItem;
import com.eclipsewarden.item.UmbralScepterItem;
import com.eclipsewarden.item.WardenCrownItem;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.item.ArmorItem;
import net.minecraft.item.Item;
import net.minecraft.item.ItemGroup;
import net.minecraft.item.ItemStack;
import net.minecraft.item.SpawnEggItem;
import net.minecraft.item.SwordItem;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.text.Text;
import net.minecraft.util.Rarity;

public final class ModItems {
	public static final Item ECLIPSE_SIGIL = register("eclipse_sigil", new LoreItem(new Item.Settings().maxCount(16).rarity(Rarity.UNCOMMON)));
	public static final Item UMBRAL_SHARD = register("umbral_shard", new Item(new Item.Settings().rarity(Rarity.UNCOMMON)));
	public static final Item ECLIPSE_CORE = register("eclipse_core", new LoreItem(new Item.Settings().rarity(Rarity.EPIC).fireproof()));
	public static final Item ECLIPSE_BLADE = register("eclipse_blade", new EclipseBladeItem(EclipseMaterials.TOOL,
			new Item.Settings().rarity(Rarity.EPIC).fireproof()
					.attributeModifiers(SwordItem.createAttributeModifiers(EclipseMaterials.TOOL, 3, -2.4f))));
	public static final Item UMBRAL_SCEPTER = register("umbral_scepter", new UmbralScepterItem(
			new Item.Settings().maxDamage(480).rarity(Rarity.RARE)));
	public static final Item WARDEN_CROWN = register("warden_crown", new WardenCrownItem(EclipseMaterials.ARMOR,
			new Item.Settings().maxDamage(ArmorItem.Type.HELMET.getMaxDamage(40)).rarity(Rarity.EPIC).fireproof()));
	public static final Item ECLIPSE_WARDEN_SPAWN_EGG = register("eclipse_warden_spawn_egg",
			new SpawnEggItem(ModEntities.ECLIPSE_WARDEN, 0x2E244E, 0xFFDC7A, new Item.Settings()));

	public static final ItemGroup GROUP = Registry.register(Registries.ITEM_GROUP, EclipseWarden.id("main"),
			FabricItemGroup.builder().displayName(Text.translatable("itemGroup.eclipsewarden"))
					.icon(() -> new ItemStack(ECLIPSE_CORE))
					.entries((context, entries) -> {
						entries.add(ModBlocks.ECLIPSE_ALTAR);
						entries.add(ECLIPSE_SIGIL);
						entries.add(ECLIPSE_BLADE);
						entries.add(UMBRAL_SCEPTER);
						entries.add(WARDEN_CROWN);
						entries.add(ECLIPSE_CORE);
						entries.add(UMBRAL_SHARD);
						entries.add(ModBlocks.UMBRAL_STONE);
						entries.add(ModBlocks.UMBRAL_BRICKS);
						entries.add(ModBlocks.UMBRAL_TILES);
						entries.add(ModBlocks.GILDED_UMBRAL_TILES);
						entries.add(ModBlocks.CHISELED_UMBRAL_BRICKS);
						entries.add(ModBlocks.UMBRAL_PILLAR);
						entries.add(ModBlocks.ECLIPSE_LANTERN);
						entries.add(ECLIPSE_WARDEN_SPAWN_EGG);
					}).build());

	private ModItems() {
	}

	private static Item register(String name, Item item) {
		return Registry.register(Registries.ITEM, EclipseWarden.id(name), item);
	}

	public static void init() {
	}
}
