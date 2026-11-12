package com.eclipsewarden.world;

import com.eclipsewarden.EclipseWarden;
import com.eclipsewarden.entity.EclipseWardenEntity;
import com.eclipsewarden.registry.ModBlocks;
import com.eclipsewarden.registry.ModEntities;
import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Collection;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.minecraft.block.Block;
import net.minecraft.entity.Entity;
import net.minecraft.item.BlockItem;
import net.minecraft.network.packet.s2c.play.SubtitleS2CPacket;
import net.minecraft.network.packet.s2c.play.TitleS2CPacket;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.TeleportTarget;
import net.minecraft.world.World;

/** The boss dimension: one floating arena around the origin, entered only through the ritual. */
public final class EclipsedCourt {
	public static final RegistryKey<World> WORLD_KEY = RegistryKey.of(RegistryKeys.WORLD, EclipseWarden.id("eclipsed_court"));
	/** Where the Warden rises, and where the altar home stands between fights. */
	public static final BlockPos ALTAR_POS = new BlockPos(0, ArenaBuilder.FLOOR_Y + 1, 0);
	public static final Vec3d WARDEN_SPAWN = Vec3d.ofBottomCenter(ALTAR_POS);
	private static final double ENTRY_DISTANCE = 16.0;
	private static final int FALL_RESCUE_DEPTH = 14;

	/** Where a player stood before the ritual took them, so the altar can send them back. */
	public record ReturnPoint(RegistryKey<World> dimension, Vec3d pos, float yaw) {
		public static final Codec<ReturnPoint> CODEC = RecordCodecBuilder.create(instance -> instance.group(
				World.CODEC.fieldOf("dimension").forGetter(ReturnPoint::dimension),
				Vec3d.CODEC.fieldOf("pos").forGetter(ReturnPoint::pos),
				Codec.FLOAT.fieldOf("yaw").forGetter(ReturnPoint::yaw)).apply(instance, ReturnPoint::new));
	}

	public static final AttachmentType<ReturnPoint> RETURN_POINT = AttachmentRegistry.createPersistent(
			EclipseWarden.id("return_point"), ReturnPoint.CODEC);

	private EclipsedCourt() {
	}

	public static void init() {
		ServerTickEvents.END_WORLD_TICK.register(world -> {
			if (world.getRegistryKey() == WORLD_KEY && !world.getPlayers().isEmpty()) {
				tick(world);
			}
		});
		// survival players cannot dig up or wall off the arena
		PlayerBlockBreakEvents.BEFORE.register((world, player, pos, state, blockEntity) -> {
			if (world.getRegistryKey() != WORLD_KEY || player.isCreative()) {
				return true;
			}
			player.sendMessage(Text.translatable("message.eclipsewarden.protected"), true);
			return false;
		});
		UseBlockCallback.EVENT.register((player, world, hand, hit) -> {
			if (world.getRegistryKey() == WORLD_KEY && !player.isCreative() && !player.isSpectator()
					&& player.getStackInHand(hand).getItem() instanceof BlockItem) {
				return ActionResult.FAIL;
			}
			return ActionResult.PASS;
		});
	}

	private static void tick(ServerWorld world) {
		long time = world.getTime();
		if (time % 5 == 0) {
			for (ServerPlayerEntity player : world.getPlayers()) {
				if (player.getY() < ArenaBuilder.FLOOR_Y - FALL_RESCUE_DEPTH && player.isAlive() && !player.isSpectator()) {
					// the void spits challengers back onto the arena, bruised, instead of taking their gear
					Vec3d spot = entryPoint(0, 1);
					player.teleport(world, spot.x, spot.y, spot.z, 180.0f, 0.0f);
					player.setVelocity(Vec3d.ZERO);
					player.velocityModified = true;
					player.fallDistance = 0;
					player.damage(world.getDamageSources().magic(), 6.0f);
					world.playSound(null, spot.x, spot.y, spot.z, SoundEvents.ENTITY_ENDERMAN_TELEPORT, SoundCategory.PLAYERS, 1.0f, 0.5f);
				}
			}
		}
		if (time % 40 == 0 && !world.getBlockState(ALTAR_POS).isOf(ModBlocks.ECLIPSE_ALTAR)
				&& world.getEntitiesByType(ModEntities.ECLIPSE_WARDEN, entity -> true).isEmpty()) {
			// no Warden and no way home (e.g. after a restart): restore the altar
			placeReturnAltar(world);
		}
	}

	private static Vec3d entryPoint(int index, int count) {
		double angle = (index - (count - 1) / 2.0) * 0.14;
		return new Vec3d(0.5 + Math.sin(angle) * ENTRY_DISTANCE, ArenaBuilder.FLOOR_Y + 1, 0.5 + Math.cos(angle) * ENTRY_DISTANCE);
	}

	/** Repairs the arena, brings the players in and raises the Warden unless one is already fighting. */
	public static boolean beginFight(MinecraftServer server, Collection<ServerPlayerEntity> players) {
		ServerWorld court = server.getWorld(WORLD_KEY);
		if (court == null) {
			EclipseWarden.LOGGER.error("Dimension {} is missing; is the mod's data pack disabled?", WORLD_KEY.getValue());
			players.forEach(player -> player.sendMessage(Text.translatable("message.eclipsewarden.no_court"), false));
			return false;
		}
		boolean running = !court.getEntitiesByType(ModEntities.ECLIPSE_WARDEN, Entity::isAlive).isEmpty();
		if (!running) {
			ArenaBuilder.build(court);
		}
		int index = 0;
		for (ServerPlayerEntity player : players) {
			if (player.getWorld() != court) {
				player.setAttached(RETURN_POINT, new ReturnPoint(player.getWorld().getRegistryKey(), player.getPos(), player.getYaw()));
			}
			Vec3d spot = entryPoint(index++, players.size());
			player.teleportTo(new TeleportTarget(court, spot, Vec3d.ZERO, 180.0f, 0.0f, TeleportTarget.NO_OP));
			player.fallDistance = 0;
			player.networkHandler.sendPacket(new SubtitleS2CPacket(Text.translatable("title.eclipsewarden.court.sub").formatted(Formatting.GRAY)));
			player.networkHandler.sendPacket(new TitleS2CPacket(Text.translatable("title.eclipsewarden.court").formatted(Formatting.GOLD)));
		}
		if (!running) {
			EclipseWardenEntity warden = ModEntities.ECLIPSE_WARDEN.create(court);
			if (warden != null) {
				warden.refreshPositionAndAngles(WARDEN_SPAWN.x, WARDEN_SPAWN.y, WARDEN_SPAWN.z, 0.0f, 0.0f);
				warden.beginSpawnSequence();
				court.spawnEntity(warden);
			}
		}
		return true;
	}

	/** Sends a player back to where the ritual found them, or to world spawn if that is unknown. */
	public static void sendHome(ServerPlayerEntity player) {
		MinecraftServer server = player.getServer();
		ReturnPoint point = player.removeAttached(RETURN_POINT);
		ServerWorld target = point == null ? null : server.getWorld(point.dimension());
		if (target == null || target.getRegistryKey() == WORLD_KEY) {
			target = server.getOverworld();
			BlockPos spawn = target.getSpawnPos();
			point = new ReturnPoint(target.getRegistryKey(), Vec3d.ofBottomCenter(spawn), target.getSpawnAngle());
		}
		player.teleportTo(new TeleportTarget(target, point.pos(), Vec3d.ZERO, point.yaw(), 0.0f, TeleportTarget.NO_OP));
		player.fallDistance = 0;
		target.playSound(null, point.pos().x, point.pos().y, point.pos().z, SoundEvents.BLOCK_PORTAL_TRAVEL, SoundCategory.PLAYERS, 0.3f, 1.4f);
	}

	public static void onWardenDefeated(ServerWorld world) {
		if (world.getRegistryKey() != WORLD_KEY) {
			return;
		}
		placeReturnAltar(world);
		for (ServerPlayerEntity player : world.getPlayers()) {
			player.networkHandler.sendPacket(new TitleS2CPacket(Text.translatable("title.eclipsewarden.victory").formatted(Formatting.GOLD)));
			player.sendMessage(Text.translatable("message.eclipsewarden.victory").formatted(Formatting.LIGHT_PURPLE), false);
		}
	}

	private static void placeReturnAltar(ServerWorld world) {
		world.setBlockState(ALTAR_POS, ModBlocks.ECLIPSE_ALTAR.getDefaultState(), Block.NOTIFY_ALL);
	}
}
