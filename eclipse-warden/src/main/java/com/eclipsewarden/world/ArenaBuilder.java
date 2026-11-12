package com.eclipsewarden.world;

import com.eclipsewarden.registry.ModBlocks;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;

/**
 * Lays out the Eclipsed Court: a floating disc with a sunburst floor, a ring of pillars and a few
 * drifting islands. The layout is deterministic, so building again only repairs what changed.
 */
public final class ArenaBuilder {
	public static final int FLOOR_Y = 64;
	public static final int RADIUS = 25;
	private static final int CLEAR_HEIGHT = 16;
	private static final int[] PILLAR_HEIGHTS = {8, 8, 3, 8, 8, 5, 8, 8};
	private static Map<BlockPos, BlockState> design;

	private ArenaBuilder() {
	}

	public static void build(ServerWorld world) {
		Map<BlockPos, BlockState> layout = design();
		int flags = Block.NOTIFY_LISTENERS | Block.FORCE_STATE;
		BlockState air = Blocks.AIR.getDefaultState();
		BlockPos.Mutable pos = new BlockPos.Mutable();
		int reach = RADIUS + 2;
		for (int x = -reach; x <= reach; x++) {
			for (int z = -reach; z <= reach; z++) {
				if (x * x + z * z > reach * reach) {
					continue;
				}
				for (int y = FLOOR_Y + 1; y <= FLOOR_Y + CLEAR_HEIGHT; y++) {
					pos.set(x, y, z);
					if (!layout.containsKey(pos) && !world.getBlockState(pos).isAir()) {
						world.setBlockState(pos, air, flags);
					}
				}
			}
		}
		layout.forEach((p, state) -> {
			if (world.getBlockState(p) != state) {
				world.setBlockState(p, state, flags);
			}
		});
	}

	private static Map<BlockPos, BlockState> design() {
		if (design == null) {
			Map<BlockPos, BlockState> map = new HashMap<>();
			disc(map);
			pillars(map);
			islands(map);
			design = map;
		}
		return design;
	}

	private static double hash(int x, int y, int z) {
		long h = x * 3129871L ^ z * 116129781L ^ y * 42317861L;
		h = h * h * 42317861L + h * 11L;
		return Math.floorMod(h / 65536L, 65536L) / 65535.0;
	}

	private static void put(Map<BlockPos, BlockState> map, int x, int y, int z, Block block) {
		map.put(new BlockPos(x, y, z), block.getDefaultState());
	}

	private static void disc(Map<BlockPos, BlockState> map) {
		for (int x = -RADIUS; x <= RADIUS; x++) {
			for (int z = -RADIUS; z <= RADIUS; z++) {
				double d = Math.sqrt(x * x + z * z);
				if (d > RADIUS + 0.5) {
					continue;
				}
				put(map, x, FLOOR_Y, z, floor(x, z, d));
				// the underside tapers to a ragged point beneath the centre
				double depth = 2 + (RADIUS - d) * 0.5 + hash(x / 3, 7, z / 3) * 3 + (d < 6 ? (6 - d) * 2.5 : 0);
				for (int dy = 1; dy <= depth; dy++) {
					double h = hash(x, dy, z);
					Block block = dy == 1 ? ModBlocks.UMBRAL_BRICKS : h < 0.04 ? Blocks.CRYING_OBSIDIAN
							: h < 0.08 ? Blocks.AMETHYST_BLOCK : h < 0.3 ? ModBlocks.UMBRAL_BRICKS : ModBlocks.UMBRAL_STONE;
					put(map, x, FLOOR_Y - dy, z, block);
				}
				// a broken parapet around the rim
				if (d > RADIUS - 0.6) {
					double h = hash(x, 99, z);
					if (h > 0.25) {
						put(map, x, FLOOR_Y + 1, z, ModBlocks.UMBRAL_BRICKS);
						if (h > 0.8) {
							put(map, x, FLOOR_Y + 2, z, ModBlocks.CHISELED_UMBRAL_BRICKS);
						}
					}
				}
			}
		}
		for (int k = 0; k < 8; k++) {
			double angle = k * Math.PI / 4;
			put(map, (int) Math.round(Math.cos(angle) * 12), FLOOR_Y, (int) Math.round(Math.sin(angle) * 12), ModBlocks.ECLIPSE_LANTERN);
		}
	}

	private static Block floor(int x, int z, double d) {
		if (d < 1.5) {
			return ModBlocks.CHISELED_UMBRAL_BRICKS;
		}
		if (d < 3.3 || Math.abs(d - 8) < 0.55 || Math.abs(d - 16) < 0.55 || d > RADIUS - 1.6) {
			return ModBlocks.GILDED_UMBRAL_TILES;
		}
		for (int k = 0; k < 4; k++) {
			double angle = k * Math.PI / 4;
			if (Math.abs(x * Math.sin(angle) - z * Math.cos(angle)) < 0.6) {
				return ModBlocks.UMBRAL_TILES;
			}
		}
		int sector = MathHelper.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 8));
		int band = (int) (d / 4);
		return ((sector + band) & 1) == 0 ? ModBlocks.UMBRAL_BRICKS : ModBlocks.UMBRAL_STONE;
	}

	private static void pillars(Map<BlockPos, BlockState> map) {
		for (int k = 0; k < 8; k++) {
			double angle = Math.toRadians(22.5 + 45 * k);
			int px = (int) Math.round(Math.cos(angle) * 20);
			int pz = (int) Math.round(Math.sin(angle) * 20);
			int height = PILLAR_HEIGHTS[k];
			for (int dx = -1; dx <= 1; dx++) {
				for (int dz = -1; dz <= 1; dz++) {
					put(map, px + dx, FLOOR_Y + 1, pz + dz, ModBlocks.GILDED_UMBRAL_TILES);
				}
			}
			for (int i = 0; i < height; i++) {
				put(map, px, FLOOR_Y + 2 + i, pz, ModBlocks.UMBRAL_PILLAR);
			}
			int top = FLOOR_Y + 2 + height;
			if (height == 8) {
				put(map, px, top, pz, ModBlocks.GILDED_UMBRAL_TILES);
				put(map, px, top + 1, pz, ModBlocks.ECLIPSE_LANTERN);
			} else {
				// a shattered pillar: its upper half still hangs in the air
				put(map, px + 1, FLOOR_Y + 2, pz, ModBlocks.UMBRAL_BRICKS);
				put(map, px, top + 2, pz, ModBlocks.UMBRAL_PILLAR);
				put(map, px, top + 3, pz, ModBlocks.UMBRAL_PILLAR);
				put(map, px, top + 5, pz, ModBlocks.ECLIPSE_LANTERN);
			}
		}
	}

	private static void islands(Map<BlockPos, BlockState> map) {
		for (int k = 0; k < 7; k++) {
			double angle = Math.toRadians(13 + 51.4 * k);
			double distance = 36 + (k % 3) * 5;
			int cx = (int) Math.round(Math.cos(angle) * distance);
			int cz = (int) Math.round(Math.sin(angle) * distance);
			int cy = FLOOR_Y - 2 + ((k * 5) % 7 - 3) * 3;
			int rx = 3 + k % 3;
			int rz = 3 + ((k + 1) % 2) * 2;
			int ry = 4 + (k % 2) * 3;
			for (int dx = -rx; dx <= rx; dx++) {
				for (int dz = -rz; dz <= rz; dz++) {
					for (int dy = 0; dy >= -ry; dy--) {
						double e = sq(dx / (double) rx) + sq(dz / (double) rz) + sq(dy / (double) ry);
						if (e <= 1.0) {
							put(map, cx + dx, cy + dy, cz + dz, dy == 0
									? (hash(cx + dx, k, cz + dz) > 0.5 ? ModBlocks.UMBRAL_TILES : ModBlocks.UMBRAL_BRICKS)
									: ModBlocks.UMBRAL_STONE);
						}
					}
				}
			}
			int stub = 1 + k % 4;
			for (int i = 1; i <= stub; i++) {
				put(map, cx, cy + i, cz, ModBlocks.UMBRAL_PILLAR);
			}
			put(map, cx, cy + stub + 1, cz, ModBlocks.ECLIPSE_LANTERN);
		}
	}

	private static double sq(double v) {
		return v * v;
	}
}
