package com.eclipsewarden.ritual;

import com.eclipsewarden.block.EclipseAltarBlock;
import com.eclipsewarden.registry.ModBlocks;
import com.eclipsewarden.registry.ModEntities;
import com.eclipsewarden.registry.ModItems;
import com.eclipsewarden.registry.ModParticles;
import com.eclipsewarden.world.EclipsedCourt;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.block.AbstractCandleBlock;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LightningEntity;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.item.ItemStack;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.tag.BlockTags;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;

/**
 * Runs the summoning: an Eclipse Sigil offered to an altar with a lit candle two blocks out on each
 * of its four sides starts a six second ritual that carries everyone nearby into the Eclipsed Court.
 */
public final class RitualManager {
	private static final int DURATION = 120;
	private static final double GATHER_RADIUS = 10.0;
	private static final BlockPos[] CANDLE_OFFSETS = {
		new BlockPos(2, 0, 0), new BlockPos(-2, 0, 0), new BlockPos(0, 0, 2), new BlockPos(0, 0, -2)
	};
	private static final List<Ritual> ACTIVE = new ArrayList<>();

	private RitualManager() {
	}

	public static void init() {
		ServerTickEvents.END_SERVER_TICK.register(server -> {
			for (Iterator<Ritual> it = ACTIVE.iterator(); it.hasNext();) {
				if (!it.next().tick()) {
					it.remove();
				}
			}
		});
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> ACTIVE.clear());
	}

	/** Returns true when the sigil was accepted. */
	public static boolean tryStart(ServerWorld world, BlockPos pos, ServerPlayerEntity player) {
		if (world.getRegistryKey() == EclipsedCourt.WORLD_KEY) {
			// already in the Court: a sigil simply wakes the Warden again
			if (!world.getEntitiesByType(ModEntities.ECLIPSE_WARDEN, Entity::isAlive).isEmpty()) {
				player.sendMessage(Text.translatable("message.eclipsewarden.fight_running"), true);
				return false;
			}
			return EclipsedCourt.beginFight(world.getServer(), new ArrayList<>(world.getPlayers()));
		}
		for (Ritual ritual : ACTIVE) {
			if (ritual.world == world && ritual.pos.equals(pos)) {
				player.sendMessage(Text.translatable("message.eclipsewarden.ritual_running"), true);
				return false;
			}
		}
		if (world.getServer().getWorld(EclipsedCourt.WORLD_KEY) == null) {
			player.sendMessage(Text.translatable("message.eclipsewarden.no_court"), true);
			return false;
		}
		boolean ready = true;
		for (BlockPos offset : CANDLE_OFFSETS) {
			BlockPos candle = pos.add(offset);
			if (!isLitCandle(world.getBlockState(candle))) {
				ready = false;
				world.spawnParticles(ParticleTypes.SMOKE, candle.getX() + 0.5, candle.getY() + 0.4, candle.getZ() + 0.5, 12, 0.15, 0.2, 0.15, 0.01);
			}
		}
		if (!ready) {
			player.sendMessage(Text.translatable("message.eclipsewarden.need_candles"), true);
			world.playSound(null, pos, SoundEvents.BLOCK_FIRE_EXTINGUISH, SoundCategory.BLOCKS, 0.6f, 0.7f);
			return false;
		}
		ACTIVE.add(new Ritual(world, pos.toImmutable()));
		return true;
	}

	private static boolean isLitCandle(BlockState state) {
		return state.isIn(BlockTags.CANDLES) && state.get(AbstractCandleBlock.LIT);
	}

	private static final class Ritual {
		private final ServerWorld world;
		private final BlockPos pos;
		private final Vec3d top;
		private int ticks;

		private Ritual(ServerWorld world, BlockPos pos) {
			this.world = world;
			this.pos = pos;
			this.top = Vec3d.ofCenter(pos).add(0, 0.5, 0);
		}

		private boolean tick() {
			BlockState state = world.getBlockState(pos);
			if (!state.isOf(ModBlocks.ECLIPSE_ALTAR)) {
				return false;
			}
			if (ticks == 0) {
				world.setBlockState(pos, state.with(EclipseAltarBlock.ACTIVE, true), Block.NOTIFY_ALL);
				world.playSound(null, pos, SoundEvents.BLOCK_RESPAWN_ANCHOR_CHARGE, SoundCategory.BLOCKS, 1.5f, 0.6f);
				world.playSound(null, pos, SoundEvents.BLOCK_BEACON_ACTIVATE, SoundCategory.BLOCKS, 1.5f, 0.5f);
				for (ServerPlayerEntity player : gathered()) {
					player.sendMessage(Text.translatable("message.eclipsewarden.ritual_start").formatted(Formatting.GOLD), true);
				}
			}
			float progress = ticks / (float) DURATION;

			// each candle feeds a stream of light into the altar
			for (BlockPos offset : CANDLE_OFFSETS) {
				Vec3d from = Vec3d.ofCenter(pos.add(offset)).add(0, 0.3, 0);
				for (int i = 0; i < 2; i++) {
					double t = ((ticks + i * 5) % 10) / 10.0;
					Vec3d p = from.lerp(top, t).add(0, Math.sin(t * Math.PI) * 0.9, 0);
					world.spawnParticles(ModParticles.ECLIPSE_SPARK, p.x, p.y, p.z, 1, 0.02, 0.02, 0.02, 0);
				}
			}
			// a double helix tightening and climbing above the altar
			double radius = 2.4 * (1.0 - progress) + 0.3;
			for (int arm = 0; arm < 2; arm++) {
				double angle = ticks * 0.35 + arm * Math.PI;
				world.spawnParticles(ModParticles.UMBRAL_WISP, top.x + Math.cos(angle) * radius, top.y + 0.2 + progress * 3.5,
						top.z + Math.sin(angle) * radius, 2, 0.03, 0.03, 0.03, 0);
			}
			if (ticks > 50) {
				world.spawnParticles(ParticleTypes.END_ROD, top.x, top.y + 0.3, top.z, 3, 0.1, 0.1, 0.1, 0.12 + progress * 0.2);
				world.spawnParticles(ParticleTypes.REVERSE_PORTAL, top.x, top.y + 1.5, top.z, 8, 1.2, 1.2, 1.2, 0.05);
			}
			if (ticks % 20 == 0) {
				world.playSound(null, pos, SoundEvents.BLOCK_BEACON_AMBIENT, SoundCategory.BLOCKS, 2.0f, 0.5f + progress * 1.2f);
				world.playSound(null, pos, SoundEvents.BLOCK_AMETHYST_BLOCK_CHIME, SoundCategory.BLOCKS, 2.0f, 0.5f + progress);
			}
			if (ticks == 80) {
				world.playSound(null, pos, SoundEvents.BLOCK_END_PORTAL_SPAWN, SoundCategory.BLOCKS, 0.8f, 0.7f);
				for (ServerPlayerEntity player : gathered()) {
					player.addStatusEffect(new StatusEffectInstance(StatusEffects.DARKNESS, 100, 0, false, false));
				}
			}
			if (ticks == 105) {
				LightningEntity bolt = EntityType.LIGHTNING_BOLT.create(world);
				if (bolt != null) {
					bolt.refreshPositionAfterTeleport(Vec3d.ofBottomCenter(pos.up()));
					bolt.setCosmetic(true);
					world.spawnEntity(bolt);
				}
			}
			if (++ticks < DURATION) {
				return true;
			}
			finish();
			return false;
		}

		private List<ServerPlayerEntity> gathered() {
			return world.getPlayers(player -> player.isAlive() && !player.isSpectator()
					&& player.squaredDistanceTo(top) <= GATHER_RADIUS * GATHER_RADIUS);
		}

		private void finish() {
			world.setBlockState(pos, world.getBlockState(pos).with(EclipseAltarBlock.ACTIVE, false), Block.NOTIFY_ALL);
			for (BlockPos offset : CANDLE_OFFSETS) {
				BlockPos candle = pos.add(offset);
				BlockState state = world.getBlockState(candle);
				if (isLitCandle(state)) {
					AbstractCandleBlock.extinguish(null, state, world, candle);
				}
			}
			world.spawnParticles(ParticleTypes.FLASH, top.x, top.y + 1, top.z, 1, 0, 0, 0, 0);
			world.spawnParticles(ModParticles.ECLIPSE_SPARK, top.x, top.y + 1, top.z, 120, 0.5, 0.8, 0.5, 0.35);
			List<ServerPlayerEntity> players = gathered();
			if (players.isEmpty() || !EclipsedCourt.beginFight(world.getServer(), players)) {
				// nobody to carry over: hand the sigil back rather than eat it
				Block.dropStack(world, pos.up(), new ItemStack(ModItems.ECLIPSE_SIGIL));
				world.playSound(null, pos, SoundEvents.BLOCK_FIRE_EXTINGUISH, SoundCategory.BLOCKS, 1.0f, 0.6f);
			}
		}
	}
}
