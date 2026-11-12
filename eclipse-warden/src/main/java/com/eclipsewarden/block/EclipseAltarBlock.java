package com.eclipsewarden.block;

import com.eclipsewarden.registry.ModItems;
import com.eclipsewarden.registry.ModParticles;
import com.eclipsewarden.ritual.RitualManager;
import com.eclipsewarden.world.EclipsedCourt;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.ShapeContext;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.state.StateManager;
import net.minecraft.state.property.BooleanProperty;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.util.ItemActionResult;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.util.shape.VoxelShape;
import net.minecraft.util.shape.VoxelShapes;
import net.minecraft.world.BlockView;
import net.minecraft.world.World;

/**
 * Heart of the summoning ritual. In the overworld it takes an Eclipse Sigil once four lit candles
 * surround it; inside the Eclipsed Court it is the way home (or, with a sigil, a rematch).
 */
public class EclipseAltarBlock extends Block {
	public static final BooleanProperty ACTIVE = BooleanProperty.of("active");
	private static final VoxelShape SHAPE = VoxelShapes.union(
			Block.createCuboidShape(1, 0, 1, 15, 3, 15),
			Block.createCuboidShape(3, 3, 3, 13, 5, 13),
			Block.createCuboidShape(5, 5, 5, 11, 10, 11),
			Block.createCuboidShape(1, 10, 1, 15, 14, 15));

	public EclipseAltarBlock(Settings settings) {
		super(settings);
		setDefaultState(getDefaultState().with(ACTIVE, false));
	}

	@Override
	protected void appendProperties(StateManager.Builder<Block, BlockState> builder) {
		builder.add(ACTIVE);
	}

	@Override
	protected VoxelShape getOutlineShape(BlockState state, BlockView world, BlockPos pos, ShapeContext context) {
		return SHAPE;
	}

	@Override
	protected ItemActionResult onUseWithItem(ItemStack stack, BlockState state, World world, BlockPos pos, PlayerEntity player,
			Hand hand, BlockHitResult hit) {
		if (!stack.isOf(ModItems.ECLIPSE_SIGIL)) {
			return ItemActionResult.PASS_TO_DEFAULT_BLOCK_INTERACTION;
		}
		if (world instanceof ServerWorld serverWorld && player instanceof ServerPlayerEntity serverPlayer
				&& RitualManager.tryStart(serverWorld, pos, serverPlayer)) {
			stack.decrementUnlessCreative(1, player);
		}
		return ItemActionResult.success(world.isClient);
	}

	@Override
	protected ActionResult onUse(BlockState state, World world, BlockPos pos, PlayerEntity player, BlockHitResult hit) {
		if (player instanceof ServerPlayerEntity serverPlayer) {
			if (world.getRegistryKey() == EclipsedCourt.WORLD_KEY) {
				EclipsedCourt.sendHome(serverPlayer);
			} else {
				player.sendMessage(Text.translatable("message.eclipsewarden.altar_hint"), true);
			}
		}
		return ActionResult.success(world.isClient);
	}

	@Override
	public void randomDisplayTick(BlockState state, World world, BlockPos pos, Random random) {
		int count = state.get(ACTIVE) ? 4 : 1;
		for (int i = 0; i < count; i++) {
			world.addParticle(random.nextBoolean() ? ModParticles.UMBRAL_WISP : ModParticles.ECLIPSE_SPARK,
					pos.getX() + 0.2 + random.nextDouble() * 0.6, pos.getY() + 0.95, pos.getZ() + 0.2 + random.nextDouble() * 0.6,
					0, 0.02 + random.nextDouble() * 0.03, 0);
		}
	}
}
