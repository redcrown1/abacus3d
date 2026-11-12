package com.eclipsewarden.registry;

import com.eclipsewarden.world.ArenaBuilder;
import com.eclipsewarden.world.EclipsedCourt;
import java.util.List;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;

/** Operator shortcuts: /eclipsewarden enter | leave | rebuild. */
public final class ModCommands {
	private ModCommands() {
	}

	public static void init() {
		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> dispatcher.register(
				CommandManager.literal("eclipsewarden").requires(source -> source.hasPermissionLevel(2))
						.then(CommandManager.literal("enter").executes(context -> {
							ServerCommandSource source = context.getSource();
							if (!EclipsedCourt.beginFight(source.getServer(), List.of(source.getPlayerOrThrow()))) {
								return 0;
							}
							source.sendFeedback(() -> Text.translatable("commands.eclipsewarden.enter"), true);
							return 1;
						}))
						.then(CommandManager.literal("leave").executes(context -> {
							EclipsedCourt.sendHome(context.getSource().getPlayerOrThrow());
							context.getSource().sendFeedback(() -> Text.translatable("commands.eclipsewarden.leave"), true);
							return 1;
						}))
						.then(CommandManager.literal("rebuild").executes(context -> {
							ServerWorld court = context.getSource().getServer().getWorld(EclipsedCourt.WORLD_KEY);
							if (court == null) {
								context.getSource().sendError(Text.translatable("message.eclipsewarden.no_court"));
								return 0;
							}
							ArenaBuilder.build(court);
							context.getSource().sendFeedback(() -> Text.translatable("commands.eclipsewarden.rebuild"), true);
							return 1;
						}))));
	}
}
