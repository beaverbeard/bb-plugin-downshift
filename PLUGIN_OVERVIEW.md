## Companion native build required

Economy is experimental and requires the included companion BB source
integration. It has not shipped upstream. Stock BB shows a disabled control;
the UI alone cannot provide a global execution overlay. The package contains
an exact source patch, checksum, build guide and compatibility check.

## Global Codex profile

On the companion build, one Economy button selects Luna, medium reasoning and
Fast off across Codex threads. Active work keeps its current profile; the next
native turn uses the new one. Other providers keep their settings. Turning
Economy off restores original execution semantics, including inherited values.
The native journal and restore readers survive removal of the plugin.

## Quota and automatic activation

Automatic activation is on by default. Economy enables once when any confirmed
active Codex quota window has 5% or less remaining. The current adapter reads
shared Codex account quota on BB's primary host; it does not infer separate
model limits or combine accounts. Manual OFF takes priority until the window
resets, including when quota was temporarily unknown. There is no automatic OFF,
and stale readings cannot activate the mode.

An icon switch slides between original profiles (rabbit) and Economy (turtle).
Click, tap, swipe or use the keyboard. OFF follows BB’s theme; ON is orange.
The removable warm tint follows that same theme. Warnings and unconfirmed cached
state are explicit. All plugin text is English. Shared subscription limits still
apply. Quota is read internally for automatic activation; no percentage widget
is included.

## Requirements

Requires the companion native bb.execution-policy/v1 build on the server and
execution hosts, a Codex provider, and Luna/medium available in each target
host's native catalog. Usage comes from BB's native subscription integration;
no separate paid API service is used. This package never patches an installed
runtime or restarts a service. Follow the native integration guide before
installing it for execution control.
