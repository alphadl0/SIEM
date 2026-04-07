using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;

namespace backend.src;

[Authorize(Policy = "SecurityTeamPolicy")]
public class SiemHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        // Add all authorized connections to a global group for easiest broadcast
        await Groups.AddToGroupAsync(Context.ConnectionId, "security-team");
        await base.OnConnectedAsync();
    }
}
