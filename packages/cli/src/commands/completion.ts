import type { Command } from 'commander';

const BASH = `# mnemo bash completion. Source this from your ~/.bashrc:
#   source <(mnemo completion bash)
_mnemo() {
  local cur prev cmds
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  cmds="remember recall list forget stats export import doctor hook init edit prune ingest cite why digest dead team completion"
  if [[ \${COMP_CWORD} -eq 1 ]] ; then
    COMPREPLY=( $(compgen -W "\${cmds}" -- \${cur}) )
    return 0
  fi
}
complete -F _mnemo mnemo
`;

const ZSH = `# mnemo zsh completion. Source from your .zshrc:
#   source <(mnemo completion zsh)
_mnemo() {
  local -a cmds
  cmds=(
    'remember:Capture a memory'
    'recall:Semantic search'
    'list:List memories'
    'forget:Delete a memory'
    'stats:Show stats'
    'export:Export to JSON'
    'import:Import from JSON'
    'doctor:Diagnose installation'
    'hook:Run a Claude Code hook handler'
    'init:Install into Claude Code'
    'edit:Edit a memory'
    'prune:Drop expired/duplicate memories'
    'ingest:Bulk-import a markdown file'
    'cite:Print a memory in citable form'
    'why:Show provenance + ranking breakdown'
    'digest:Summary of recent activity'
    'dead:List never-recalled memories'
    'team:Team-shared memory commands'
    'completion:Print shell completion script'
  )
  _describe 'mnemo command' cmds
}
compdef _mnemo mnemo
`;

const FISH = `# mnemo fish completion. Save to ~/.config/fish/completions/mnemo.fish:
#   mnemo completion fish > ~/.config/fish/completions/mnemo.fish
complete -c mnemo -f
complete -c mnemo -n __fish_use_subcommand -a remember -d 'Capture a memory'
complete -c mnemo -n __fish_use_subcommand -a recall   -d 'Semantic search'
complete -c mnemo -n __fish_use_subcommand -a list     -d 'List memories'
complete -c mnemo -n __fish_use_subcommand -a forget   -d 'Delete a memory'
complete -c mnemo -n __fish_use_subcommand -a stats    -d 'Show stats'
complete -c mnemo -n __fish_use_subcommand -a export   -d 'Export to JSON'
complete -c mnemo -n __fish_use_subcommand -a import   -d 'Import from JSON'
complete -c mnemo -n __fish_use_subcommand -a doctor   -d 'Diagnose installation'
complete -c mnemo -n __fish_use_subcommand -a hook     -d 'Run a Claude Code hook'
complete -c mnemo -n __fish_use_subcommand -a init     -d 'Install into Claude Code'
complete -c mnemo -n __fish_use_subcommand -a edit     -d 'Edit a memory'
complete -c mnemo -n __fish_use_subcommand -a prune    -d 'Drop expired/duplicates'
complete -c mnemo -n __fish_use_subcommand -a ingest   -d 'Bulk-import a markdown file'
complete -c mnemo -n __fish_use_subcommand -a cite     -d 'Print citable form'
complete -c mnemo -n __fish_use_subcommand -a why      -d 'Show provenance'
complete -c mnemo -n __fish_use_subcommand -a digest   -d 'Activity summary'
complete -c mnemo -n __fish_use_subcommand -a dead     -d 'List never-recalled'
complete -c mnemo -n __fish_use_subcommand -a team     -d 'Team commands'
complete -c mnemo -n __fish_use_subcommand -a completion -d 'Shell completion'
`;

export function registerCompletion(program: Command): void {
  program
    .command('completion <shell>')
    .description('Print shell completion script (bash | zsh | fish)')
    .action((shell: string) => {
      switch (shell) {
        case 'bash': process.stdout.write(BASH); return;
        case 'zsh':  process.stdout.write(ZSH); return;
        case 'fish': process.stdout.write(FISH); return;
        default:
          console.error(`unknown shell: ${shell}. Choose bash, zsh, or fish.`);
          process.exitCode = 2;
      }
    });
}
