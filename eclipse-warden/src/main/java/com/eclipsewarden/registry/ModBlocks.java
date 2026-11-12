package com.eclipsewarden.registry;

import com.eclipsewarden.EclipseWarden;
import com.eclipsewarden.block.EclipseAltarBlock;
import net.minecraft.block.AbstractBlock;
import net.minecraft.block.Block;
import net.minecraft.block.MapColor;
import net.minecraft.block.PillarBlock;
import net.minecraft.item.BlockItem;
import net.minecraft.item.Item;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.sound.BlockSoundGroup;
import net.minecraft.util.Rarity;

public final class ModBlocks {
	public static final Block UMBRAL_STONE = register("umbral_stone", new Block(stone()));
	public static final Block UMBRAL_BRICKS = register("umbral_bricks", new Block(stone()));
	public static final Block UMBRAL_TILES = register("umbral_tiles", new Block(stone()));
	public static final Block GILDED_UMBRAL_TILES = register("gilded_umbral_tiles", new Block(stone()));
	public static final Block CHISELED_UMBRAL_BRICKS = register("chiseled_umbral_bricks", new Block(stone().luminance(state -> 6)));
	public static final Block UMBRAL_PILLAR = register("umbral_pillar", new PillarBlock(stone()));
	public static final Block ECLIPSE_LANTERN = register("eclipse_lantern", new Block(stone().luminance(state -> 15)));
	public static final Block ECLIPSE_ALTAR = register("eclipse_altar", new EclipseAltarBlock(stone().strength(8.0f, 1200.0f).nonOpaque()
			.luminance(state -> state.get(EclipseAltarBlock.ACTIVE) ? 15 : 7)), new Item.Settings().rarity(Rarity.RARE));

	private ModBlocks() {
	}

	private static AbstractBlock.Settings stone() {
		return AbstractBlock.Settings.create().mapColor(MapColor.PURPLE).requiresTool().strength(3.0f, 9.0f)
				.sounds(BlockSoundGroup.DEEPSLATE_BRICKS);
	}

	private static Block register(String name, Block block) {
		return register(name, block, new Item.Settings());
	}

	private static Block register(String name, Block block, Item.Settings itemSettings) {
		Registry.register(Registries.ITEM, EclipseWarden.id(name), new BlockItem(block, itemSettings));
		return Registry.register(Registries.BLOCK, EclipseWarden.id(name), block);
	}

	public static void init() {
	}
}
